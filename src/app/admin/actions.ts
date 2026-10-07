"use server";

import bcrypt from "bcryptjs";
import { updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { MatchStatus, Prisma } from "@prisma/client";
import { requireOrganiser } from "@/lib/auth";
import { TOURNAMENT_TAG } from "@/lib/data";
import { prisma } from "@/lib/db";
import { fromDubaiInputs } from "@/lib/format";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/session-token";

export interface FormState {
  error?: string;
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
  const token = await signSession({ organiserId: organiser.id, name: organiser.name });
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

/** Snapshot of the fields an organiser can change, for the audit log. */
function snapshot(m: {
  status: MatchStatus;
  score1: number | null;
  score2: number | null;
  winnerId: number | null;
  team1Id: number | null;
  team2Id: number | null;
  startsAt: Date;
  note: string | null;
}): Prisma.InputJsonObject {
  return {
    status: m.status,
    score1: m.score1,
    score2: m.score2,
    winnerId: m.winnerId,
    team1Id: m.team1Id,
    team2Id: m.team2Id,
    startsAt: m.startsAt.toISOString(),
    note: m.note,
  };
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

  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Enter a valid date and time." };
  const startsAt = fromDubaiInputs(date, time);

  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  const after = { status, score1, score2, winnerId, team1Id, team2Id, startsAt, note };
  await prisma.$transaction([
    prisma.match.update({ where: { id: match.id }, data: { ...after, updatedById: organiser.organiserId } }),
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
  redirect(`/admin#match-${matchNo}`);
}
