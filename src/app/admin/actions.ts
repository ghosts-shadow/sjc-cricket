"use server";

import bcrypt from "bcryptjs";
import { refresh, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { MatchStatus } from "@prisma/client";
import { snapshot } from "@/lib/audit";
import { requireOrganiser } from "@/lib/auth";
import { TOURNAMENT_TAG } from "@/lib/data";
import { prisma } from "@/lib/db";
import { dayKey, fromDubaiInputs, isPastDay } from "@/lib/format";
import { clearSession, reopenSession } from "@/lib/scoring-sessions";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/session-token";

export interface FormState {
  error?: string;
  message?: string;
}

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
// Compared against when the name is unknown, so a wrong name takes as long as a wrong PIN.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-pin", 10);

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  const next = String(formData.get("next") ?? "");
  if (!name || !pin) return { error: "Enter your name and PIN." };

  const organiser = await prisma.organiser.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, active: true },
  });

  if (organiser?.lockedUntil && organiser.lockedUntil > new Date()) {
    return { error: `Too many wrong PINs. Try again after ${LOCK_MINUTES} minutes.` };
  }

  const ok = await bcrypt.compare(pin, organiser?.pinHash ?? DUMMY_HASH);
  if (!organiser || !ok) {
    if (organiser) {
      const failed = organiser.failedLogins + 1;
      await prisma.organiser.update({
        where: { id: organiser.id },
        data:
          failed >= MAX_FAILED_LOGINS
            ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
            : { failedLogins: failed },
      });
    }
    return { error: "Name or PIN is wrong." };
  }

  await prisma.organiser.update({ where: { id: organiser.id }, data: { failedLogins: 0, lockedUntil: null } });
  let token: string;
  try {
    token = await signSession({ organiserId: organiser.id, name: organiser.name });
  } catch (err) {
    // A server setup problem (e.g. SESSION_SECRET missing or too short), not the organiser's fault.
    console.error("login: could not sign session", err);
    return { error: "Sign-in isn't set up on the server yet. Your PIN is fine; tell the site admin." };
  }
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  redirect(/^\/(admin|score)(\/|$)/.test(next) ? next : "/admin");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

const STATUSES: MatchStatus[] = ["SCHEDULED", "COMPLETED", "WALKOVER", "ABANDONED", "DOUBLE_FORFEIT", "POSTPONED"];

function parseScore(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (!/^-?\d{1,3}$/.test(text)) return null;
  return Number(text);
}

function parseTeamId(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "");
  return /^\d+$/.test(text) ? Number(text) : null;
}

export async function saveResult(_prev: FormState, formData: FormData): Promise<FormState> {
  const organiser = await requireOrganiser();
  const matchNo = Number(formData.get("matchNo"));
  const match = await prisma.match.findUnique({ where: { matchNo } });
  if (!match) return { error: "Match not found." };

  const status = String(formData.get("status")) as MatchStatus;
  if (!STATUSES.includes(status)) return { error: "Pick a status." };

  // Knockout teams: whatever the form says (defaults to the resolved teams), frozen on save.
  let team1Id = match.team1Id;
  let team2Id = match.team2Id;
  if (match.stage !== "GROUP") {
    team1Id = parseTeamId(formData.get("team1Id"));
    team2Id = parseTeamId(formData.get("team2Id"));
    if (team1Id != null && team1Id === team2Id) return { error: "A team can't play itself." };
  }

  let score1: number | null = null;
  let score2: number | null = null;
  let winnerId: number | null = null;

  if (status === "COMPLETED" || status === "WALKOVER") {
    if (team1Id == null || team2Id == null) return { error: "Both teams must be known before entering a result." };
  }
  if (status === "COMPLETED") {
    score1 = parseScore(formData.get("score1"));
    score2 = parseScore(formData.get("score2"));
    if (score1 == null || score2 == null) return { error: "Enter both team totals (whole numbers)." };
    if (score1 === score2 && match.stage !== "GROUP") {
      winnerId = parseTeamId(formData.get("winnerId"));
      if (winnerId !== team1Id && winnerId !== team2Id) return { error: "Scores are level: pick the super-over winner." };
    }
  }
  if (status === "WALKOVER") {
    winnerId = parseTeamId(formData.get("winnerId"));
    if (winnerId !== team1Id && winnerId !== team2Id) return { error: "Pick the team that gets the walkover." };
  }

  const note = readNote(formData);

  // Times are changed on the fixtures page, never here, so a reschedule can't be saved as a result.
  const after = { status, score1, score2, winnerId, team1Id, team2Id, startsAt: match.startsAt, note };
  await prisma.$transaction([
    prisma.match.update({
      where: { id: match.id },
      data: { status, score1, score2, winnerId, team1Id, team2Id, note, updatedById: organiser.organiserId },
    }),
    prisma.auditLog.create({
      data: {
        organiserId: organiser.organiserId,
        matchId: match.id,
        action: "result",
        before: snapshot(match),
        after: snapshot(after),
      },
    }),
  ]);

  updateTag(TOURNAMENT_TAG);
  redirect(`/admin${isPastDay(match.startsAt.toISOString()) ? "?past=1" : ""}#match-${matchNo}`);
}

/** Result page: unlock a submitted scorer, keeping its balls. */
export async function reopenScoring(_prev: FormState, formData: FormData): Promise<FormState> {
  const organiser = await requireOrganiser();
  const error = await reopenSession(organiser.organiserId, Number(formData.get("matchNo")));
  if (error) return { error };
  refresh();
  return { message: "Live scoring reopened. The scorer can carry on, fix it and submit again." };
}

/** Result page: delete live scoring, so the scorer starts again from the toss. */
export async function clearScoring(_prev: FormState, formData: FormData): Promise<FormState> {
  const organiser = await requireOrganiser();
  const error = await clearSession(organiser.organiserId, Number(formData.get("matchNo")));
  if (error) return { error };
  refresh();
  return { message: "Live scoring cleared. The scorer starts again from the toss." };
}

function readNote(formData: FormData): string | null {
  return String(formData.get("note") ?? "").trim().slice(0, 200) || null;
}

const unplayed = (status: MatchStatus) => status === "SCHEDULED" || status === "POSTPONED";

/** New start time, remembering the first published time so public pages can say "was 5:00 PM". */
function retime(m: { startsAt: Date; originalStartsAt: Date | null }, startsAt: Date) {
  const original = m.originalStartsAt ?? m.startsAt;
  return { startsAt, originalStartsAt: original.getTime() === startsAt.getTime() ? null : original };
}

/** "Running late": shift every unplayed match from one match onward, on that match's day. */
export async function delayMatches(_prev: FormState, formData: FormData): Promise<FormState> {
  const organiser = await requireOrganiser();
  const fromMatchNo = Number(formData.get("fromMatchNo"));
  const minutes = Number(formData.get("minutes"));
  if (!Number.isInteger(minutes) || minutes === 0 || Math.abs(minutes) > 240) {
    return { error: "Enter whole minutes, up to 240 (negative to start earlier)." };
  }

  const all = await prisma.match.findMany({ orderBy: [{ startsAt: "asc" }, { matchNo: "asc" }] });
  const from = all.find((m) => m.matchNo === fromMatchNo);
  if (!from) return { error: "Pick the first match to move." };
  const day = dayKey(from.startsAt.toISOString());
  const sameDay = all.filter((m) => dayKey(m.startsAt.toISOString()) === day);
  const toMove = sameDay.slice(sameDay.indexOf(from)).filter((m) => m.status === "SCHEDULED");
  if (toMove.length === 0) return { error: "No unplayed matches from that one onward." };

  await prisma.$transaction(
    toMove.flatMap((m) => {
      const data = retime(m, new Date(m.startsAt.getTime() + minutes * 60_000));
      return [
        prisma.match.update({ where: { id: m.id }, data: { ...data, updatedById: organiser.organiserId } }),
        prisma.auditLog.create({
          data: { organiserId: organiser.organiserId, matchId: m.id, action: "delay", before: snapshot(m), after: snapshot({ ...m, ...data }) },
        }),
      ];
    }),
  );

  updateTag(TOURNAMENT_TAG);
  const count = `${toMove.length} match${toMove.length === 1 ? "" : "es"}`;
  return { message: `Moved ${count} ${Math.abs(minutes)} min ${minutes > 0 ? "later" : "earlier"} (from match ${fromMatchNo}).` };
}

/** Change a fixture's date/time, teams (group matches: same group only) and public note. */
export async function saveFixture(_prev: FormState, formData: FormData): Promise<FormState> {
  const organiser = await requireOrganiser();
  const matchNo = Number(formData.get("matchNo"));
  const match = await prisma.match.findUnique({ where: { matchNo } });
  if (!match) return { error: "Match not found." };

  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Enter a valid date and time." };
  const startsAt = fromDubaiInputs(date, time);

  let { team1Id, team2Id } = match;
  if (match.stage === "GROUP") {
    team1Id = parseTeamId(formData.get("team1Id"));
    team2Id = parseTeamId(formData.get("team2Id"));
    if (team1Id == null || team2Id == null) return { error: "Pick both teams." };
    if (team1Id === team2Id) return { error: "A team can't play itself." };
    const inGroup = await prisma.team.count({ where: { id: { in: [team1Id, team2Id] }, group: match.group ?? "" } });
    if (inGroup !== 2) return { error: `Both teams must be in Group ${match.group}.` };
    if (!unplayed(match.status) && (team1Id !== match.team1Id || team2Id !== match.team2Id)) {
      return { error: "This match has a result. Set it back to “Not played yet” on the result page before changing the teams." };
    }
  }

  const moved = startsAt.getTime() !== match.startsAt.getTime();
  const data = {
    team1Id,
    team2Id,
    note: readNote(formData),
    ...(moved ? retime(match, startsAt) : {}),
    // A postponed match that gets a new time is back on the schedule.
    ...(moved && match.status === "POSTPONED" ? { status: "SCHEDULED" as const } : {}),
  };
  await prisma.$transaction([
    prisma.match.update({ where: { id: match.id }, data: { ...data, updatedById: organiser.organiserId } }),
    prisma.auditLog.create({
      data: { organiserId: organiser.organiserId, matchId: match.id, action: "fixture", before: snapshot(match), after: snapshot({ ...match, ...data }) },
    }),
  ]);

  updateTag(TOURNAMENT_TAG);
  redirect(`/admin/fixtures${isPastDay(startsAt.toISOString()) ? "?past=1" : ""}#match-${matchNo}`);
}

/** Swap the time slots of two unplayed matches (e.g. a team arrives late). */
export async function swapSlots(_prev: FormState, formData: FormData): Promise<FormState> {
  const organiser = await requireOrganiser();
  const [a, b] = await Promise.all([
    prisma.match.findUnique({ where: { matchNo: Number(formData.get("matchNo")) } }),
    prisma.match.findUnique({ where: { matchNo: Number(formData.get("otherMatchNo")) } }),
  ]);
  if (!a || !b || a.id === b.id) return { error: "Pick another match to swap with." };
  if (!unplayed(a.status) || !unplayed(b.status)) return { error: "Only unplayed matches can swap slots." };

  const aData = retime(a, b.startsAt);
  const bData = retime(b, a.startsAt);
  await prisma.$transaction([
    prisma.match.update({ where: { id: a.id }, data: { ...aData, updatedById: organiser.organiserId } }),
    prisma.match.update({ where: { id: b.id }, data: { ...bData, updatedById: organiser.organiserId } }),
    prisma.auditLog.create({
      data: { organiserId: organiser.organiserId, matchId: a.id, action: "swap", before: snapshot(a), after: snapshot({ ...a, ...aData }) },
    }),
    prisma.auditLog.create({
      data: { organiserId: organiser.organiserId, matchId: b.id, action: "swap", before: snapshot(b), after: snapshot({ ...b, ...bData }) },
    }),
  ]);

  updateTag(TOURNAMENT_TAG);
  redirect(`/admin/fixtures#match-${a.matchNo}`);
}
