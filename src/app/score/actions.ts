"use server";

import { updateTag } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireOrganiser } from "@/lib/auth";
import { getTournament, TOURNAMENT_TAG } from "@/lib/data";
import { prisma } from "@/lib/db";
import { saveRosterNames } from "@/lib/roster";
import { clearSession } from "@/lib/scoring-sessions";
import { parseEvents, parseSetup, replay, type ScoreEvent, type ScoringSetup } from "@/lib/scoring";

export interface ScoringResult {
  ok: boolean;
  error?: string;
}

/** Background save of the scorer's ball-by-ball state, so a dead phone doesn't lose the match. */
export async function syncScoring(matchNo: number, setupInput: unknown, eventsInput: unknown): Promise<ScoringResult> {
  const organiser = await requireOrganiser();
  const setup = parseSetup(setupInput);
  const events = parseEvents(eventsInput);
  if (!setup || !events) return { ok: false, error: "Invalid scoring data." };

  const match = await prisma.match.findUnique({ where: { matchNo }, include: { scoring: true } });
  if (!match) return { ok: false, error: "Match not found." };
  if (match.scoring?.submitted) return { ok: false, error: "This match's result was already submitted." };

  const data = {
    setup: setup as unknown as Prisma.InputJsonObject,
    events: events as unknown as Prisma.InputJsonArray,
    updatedById: organiser.organiserId,
  };
  await prisma.scoringSession.upsert({
    where: { matchId: match.id },
    create: { matchId: match.id, ...data },
    update: data,
  });
  await rememberPlayers(matchNo, setup, events);
  return { ok: true };
}

/** Scorer's "Start this match over": delete the unsubmitted session so it restarts from the toss. */
export async function resetScoring(matchNo: number): Promise<ScoringResult> {
  const organiser = await requireOrganiser();
  const session = await prisma.scoringSession.findFirst({ where: { match: { matchNo } } });
  if (session?.submitted) return { ok: false, error: "This match was already submitted. Reopen it from the result page first." };
  const error = await clearSession(organiser.organiserId, matchNo);
  return error ? { ok: false, error } : { ok: true };
}

/** Grow both teams' rosters from the names in this session. Never fails the save it rides on. */
async function rememberPlayers(matchNo: number, setup: ScoringSetup, events: ScoreEvent[]) {
  try {
    const view = (await getTournament()).matches.find((m) => m.matchNo === matchNo);
    if (view?.home && view.away) await saveRosterNames({ 1: view.home.id, 2: view.away.id }, setup, events);
  } catch (err) {
    console.error("rememberPlayers failed", err);
  }
}

/** Final submit: totals are recomputed here from the events, never trusted from the phone. */
export async function submitScoring(
  matchNo: number,
  setupInput: unknown,
  eventsInput: unknown,
  superOverWinner: 1 | 2 | null,
): Promise<ScoringResult> {
  const organiser = await requireOrganiser();
  const setup = parseSetup(setupInput);
  const events = parseEvents(eventsInput);
  if (!setup || !events) return { ok: false, error: "Invalid scoring data." };

  const card = replay(setup, events);
  if (!card.finished || !card.result) return { ok: false, error: "Both innings must be finished before submitting." };

  const { matches } = await getTournament();
  const view = matches.find((m) => m.matchNo === matchNo);
  const match = await prisma.match.findUnique({ where: { matchNo }, include: { scoring: true } });
  if (!view || !match) return { ok: false, error: "Match not found." };
  if (!view.home || !view.away) return { ok: false, error: "Both teams must be known." };
  if (match.scoring?.submitted) return { ok: false, error: "This match's result was already submitted." };

  let winnerId: number | null = null;
  if (card.result.winner === null && match.stage !== "GROUP") {
    if (superOverWinner !== 1 && superOverWinner !== 2) return { ok: false, error: "Scores are level: pick the super-over winner." };
    winnerId = superOverWinner === 1 ? view.home.id : view.away.id;
  }

  const after = {
    status: "COMPLETED" as const,
    score1: card.totals[1],
    score2: card.totals[2],
    winnerId,
    team1Id: view.home.id,
    team2Id: view.away.id,
  };
  const scoringData = {
    setup: setup as unknown as Prisma.InputJsonObject,
    events: events as unknown as Prisma.InputJsonArray,
    submitted: true,
    updatedById: organiser.organiserId,
  };

  await prisma.$transaction([
    prisma.match.update({ where: { id: match.id }, data: { ...after, updatedById: organiser.organiserId } }),
    prisma.auditLog.create({
      data: {
        organiserId: organiser.organiserId,
        matchId: match.id,
        action: "scorer",
        before: { status: match.status, score1: match.score1, score2: match.score2, winnerId: match.winnerId },
        after: { status: after.status, score1: after.score1, score2: after.score2, winnerId: after.winnerId },
      },
    }),
    prisma.scoringSession.upsert({
      where: { matchId: match.id },
      create: { matchId: match.id, ...scoringData },
      update: scoringData,
    }),
  ]);

  await rememberPlayers(matchNo, setup, events);
  updateTag(TOURNAMENT_TAG);
  return { ok: true };
}
