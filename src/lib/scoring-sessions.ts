import "server-only";
import { snapshot } from "./audit";
import { prisma } from "./db";

/**
 * Organiser controls for a match's live-scoring session. Neither changes the match's saved
 * result: that's done on the result form ("Not played yet"), so each control does one thing.
 * Both return an error message, or null on success.
 */

/** Unlock a submitted scorer, keeping its balls, so a mistake can be fixed and resubmitted. */
export async function reopenSession(organiserId: number, matchNo: number): Promise<string | null> {
  const match = await prisma.match.findUnique({ where: { matchNo }, include: { scoring: true } });
  if (!match) return "Match not found.";
  if (!match.scoring?.submitted) return "Live scoring for this match isn't locked.";
  await prisma.$transaction([
    prisma.scoringSession.update({ where: { matchId: match.id }, data: { submitted: false, updatedById: organiserId } }),
    prisma.auditLog.create({
      data: { organiserId, matchId: match.id, action: "scorer-reopen", before: snapshot(match), after: snapshot(match) },
    }),
  ]);
  return null;
}

/** Delete a match's live scoring entirely, so the scorer starts again from the toss. */
export async function clearSession(organiserId: number, matchNo: number): Promise<string | null> {
  const match = await prisma.match.findUnique({ where: { matchNo }, include: { scoring: true } });
  if (!match) return "Match not found.";
  if (!match.scoring) return null; // nothing to clear
  await prisma.$transaction([
    prisma.scoringSession.delete({ where: { matchId: match.id } }),
    prisma.auditLog.create({
      data: { organiserId, matchId: match.id, action: "scorer-clear", before: snapshot(match), after: snapshot(match) },
    }),
  ]);
  return null;
}
