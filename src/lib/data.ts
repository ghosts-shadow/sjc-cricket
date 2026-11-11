import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "./db";
import { dayKey } from "./format";
import { liveScore, type LiveScore } from "./live";
import { parseEvents, parseSetup } from "./scoring";
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
  /** Set when the match was moved or delayed; see timeChangeText(). */
  originalStartsAt: string | null;
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

/**
 * Cached, for the public pages. On Vercel the 'use cache' store is in memory per server instance,
 * so after a save another instance can serve the old copy until it revalidates (about a minute).
 */
export async function getTournament(): Promise<Tournament> {
  "use cache";
  cacheLife("minutes");
  cacheTag(TOURNAMENT_TAG);
  return loadTournament();
}

/** Uncached, for organiser and scorer screens and server actions: always the latest saved result. */
export async function getTournamentLive(): Promise<Tournament> {
  return loadTournament();
}

/** A scorer who hasn't saved for this long has stopped: the match drops off the public Live section. */
const LIVE_STALE_MINUTES = 45;

export interface LiveMatch extends LiveScore {
  matchNo: number;
}

/**
 * Matches being scored right now, as viewers may see them: an over behind the play and team totals
 * only (see live.ts). The scorer's events hold player names and the overs being held back, so only
 * the worked-out LiveScore leaves this function.
 *
 * Only today's scheduled matches with a recent save count, so a practice or abandoned session never
 * shows. Cached for a few seconds: however many people are watching, the database is read about once
 * every 10 seconds per server, and a submitted result clears it through the tag.
 */
export async function getLiveScores(): Promise<LiveMatch[]> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 10, expire: 60 });
  cacheTag(TOURNAMENT_TAG);

  const now = new Date();
  const sessions = await prisma.scoringSession.findMany({
    where: {
      submitted: false,
      updatedAt: { gt: new Date(now.getTime() - LIVE_STALE_MINUTES * 60_000) },
      match: { status: "SCHEDULED" },
    },
    select: { setup: true, events: true, match: { select: { matchNo: true, startsAt: true } } },
  });

  const today = dayKey(now.toISOString());
  return sessions
    .flatMap((session): LiveMatch[] => {
      if (dayKey(session.match.startsAt.toISOString()) !== today) return [];
      const setup = parseSetup(session.setup);
      const events = parseEvents(session.events);
      if (!setup || !events || !events.some((e) => e.type === "ball")) return [];
      return [{ matchNo: session.match.matchNo, ...liveScore(setup, events) }];
    })
    .sort((a, b) => a.matchNo - b.matchNo);
}

async function loadTournament(): Promise<Tournament> {
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
      originalStartsAt: row.originalStartsAt?.toISOString() ?? null,
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
