import "server-only";
import type { MatchStatus, Prisma } from "@prisma/client";

/** Snapshot of the fields an organiser can change, for the audit log. */
export function snapshot(m: {
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
