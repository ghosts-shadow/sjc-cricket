import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "./db";
import {
  computeStandings,
  matchLabel,
  matchWinnerId,
  resolveKnockouts,
  slotLabel,
  type MatchLite,
  type StandingRow,
  type TeamLite,
} from "./tournament";

/** Every public page reads through this tag; organiser saves call updateTag(TOURNAMENT_TAG). */
export const TOURNAMENT_TAG = "tournament";

export interface MatchView extends MatchLite {
  id: number;
  startsAt: string;
  note: string | null;
  label: string;
  home: TeamLite | null;
  away: TeamLite | null;
  /** What to show when a knockout team isn't known yet, e.g. "Group A winner". */
  homeLabel: string;
  awayLabel: string;
  winner: TeamLite | null;
  finished: boolean;
}

export interface Tournament {
  teams: TeamLite[];
  matches: MatchView[];
  standings: Record<string, StandingRow[]>;
  lastUpdated: string | null;
}

export async function getTournament(): Promise<Tournament> {
  "use cache";
  cacheLife("minutes");
  cacheTag(TOURNAMENT_TAG);

  const [teamRows, matchRows] = await Promise.all([
    // Public fields only: captain contacts must never reach this cached, public data.
    prisma.team.findMany({
      select: { id: true, name: true, slug: true, group: true, drawPos: true },
      orderBy: [{ group: "asc" }, { drawPos: "asc" }],
    }),
    prisma.match.findMany({ orderBy: [{ startsAt: "asc" }, { matchNo: "asc" }] }),
  ]);

  const teams: TeamLite[] = teamRows.map(({ id, name, slug, group, drawPos }) => ({ id, name, slug, group, drawPos }));
  const byId = new Map(teams.map((t) => [t.id, t]));
  const lite: MatchLite[] = matchRows.map((m) => ({
    matchNo: m.matchNo,
    stage: m.stage,
    group: m.group,
    team1Id: m.team1Id,
    team2Id: m.team2Id,
    slot1: m.slot1,
    slot2: m.slot2,
    score1: m.score1,
    score2: m.score2,
    status: m.status,
    winnerId: m.winnerId,
  }));
  const resolved = new Map(resolveKnockouts(teams, lite).map((m) => [m.matchNo, m]));

  const matches: MatchView[] = matchRows.map((row) => {
    const m = resolved.get(row.matchNo)!;
    const home = m.home != null ? byId.get(m.home) ?? null : null;
    const away = m.away != null ? byId.get(m.away) ?? null : null;
    const winnerId = matchWinnerId({ ...m, team1Id: m.home, team2Id: m.away });
    return {
      ...m,
      id: row.id,
      startsAt: row.startsAt.toISOString(),
      note: row.note,
      label: matchLabel(m),
      home,
      away,
      homeLabel: home?.name ?? (m.slot1 ? slotLabel(m.slot1) : "TBC"),
      awayLabel: away?.name ?? (m.slot2 ? slotLabel(m.slot2) : "TBC"),
      winner: winnerId != null ? byId.get(winnerId) ?? null : null,
      finished: ["COMPLETED", "WALKOVER", "ABANDONED", "DOUBLE_FORFEIT"].includes(m.status),
    };
  });

  const touched = matchRows.filter((m) => m.updatedById != null).map((m) => m.updatedAt.getTime());
  return {
    teams,
    matches,
    standings: computeStandings(teams, lite),
    lastUpdated: touched.length ? new Date(Math.max(...touched)).toISOString() : null,
  };
}
