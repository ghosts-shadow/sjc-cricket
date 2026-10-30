import "server-only";
import { getTournamentLive, type MatchView } from "./data";
import { prisma } from "./db";
import { parseEvents, parseSetup, replay, type Scorecard } from "./scoring";

type TeamLite = NonNullable<MatchView["home"]>;

/** Every submitted scoring session, replayed, with the two teams it was between (side 1 = home). */
async function submittedCards(): Promise<{ teams: { 1: TeamLite; 2: TeamLite }; card: Scorecard }[]> {
  const [{ matches }, sessions] = await Promise.all([
    getTournamentLive(),
    prisma.scoringSession.findMany({ where: { submitted: true }, select: { setup: true, events: true, match: { select: { matchNo: true } } } }),
  ]);
  const byNo = new Map(matches.map((m) => [m.matchNo, m]));
  return sessions.flatMap((session) => {
    const view = byNo.get(session.match.matchNo);
    const setup = parseSetup(session.setup);
    const events = parseEvents(session.events);
    if (!view?.home || !view.away || !setup || !events) return [];
    return [{ teams: { 1: view.home, 2: view.away }, card: replay(setup, events) }];
  });
}

/** One batter's tournament totals, from submitted matches scored with a striker on each ball. */
export interface BattingRow {
  key: string;
  name: string;
  team: string;
  innings: number;
  runs: number;
  balls: number;
  sideRuns: number; // side runs: 1-3 off the nets and posts
  fours: number;
  sixes: number;
  outs: number;
  net: number;
}

/**
 * Per-batter totals across every submitted scoring session. Batters are matched by team and name
 * (case-insensitive), the same way the scorer's roster dropdowns are. Matches scored before
 * per-batter scoring (no striker on the balls) add nothing.
 */
export async function getBattingStats(): Promise<{ rows: BattingRow[]; matches: number }> {
  const rows = new Map<string, BattingRow>();
  let counted = 0;
  for (const { teams, card } of await submittedCards()) {
    let any = false;
    for (const inn of card.innings) {
      const team = teams[inn.battingTeam];
      for (const b of inn.batters) {
        if (b.balls === 0 && b.outs === 0) continue;
        any = true;
        const key = `${team.id}:${b.name.toLowerCase()}`;
        const row = rows.get(key) ?? { key, name: b.name, team: team.name, innings: 0, runs: 0, balls: 0, sideRuns: 0, fours: 0, sixes: 0, outs: 0, net: 0 };
        row.innings++;
        row.runs += b.runs;
        row.balls += b.balls;
        row.sideRuns += b.sideRuns;
        row.fours += b.fours;
        row.sixes += b.sixes;
        row.outs += b.outs;
        row.net += b.net;
        rows.set(key, row);
      }
    }
    if (any) counted++;
  }
  return { rows: [...rows.values()], matches: counted };
}

/** One bowler's tournament totals, from every submitted match with bowlers entered (since 8 Oct). */
export interface BowlingRow {
  key: string;
  name: string;
  team: string;
  overs: number;
  balls: number;
  runs: number; // conceded, before wickets
  wickets: number; // every wicket in their overs, run outs included
  wides: number;
  noBalls: number;
  deadBalls: number;
  sideRuns: number;
  fours: number;
  sixes: number;
  net: number; // runs - 5 per wicket
}

/** Per-bowler totals across every submitted scoring session, matched by fielding team and name (case-insensitive). */
export async function getBowlingStats(): Promise<{ rows: BowlingRow[]; matches: number }> {
  const rows = new Map<string, BowlingRow>();
  let counted = 0;
  for (const { teams, card } of await submittedCards()) {
    let any = false;
    for (const inn of card.innings) {
      const team = teams[inn.battingTeam === 1 ? 2 : 1];
      for (const b of inn.bowlers) {
        any = true;
        const key = `${team.id}:${b.name.toLowerCase()}`;
        const row = rows.get(key) ?? {
          key,
          name: b.name,
          team: team.name,
          overs: 0,
          balls: 0,
          runs: 0,
          wickets: 0,
          wides: 0,
          noBalls: 0,
          deadBalls: 0,
          sideRuns: 0,
          fours: 0,
          sixes: 0,
          net: 0,
        };
        row.overs += b.overs;
        row.balls += b.balls;
        row.runs += b.runs;
        row.wickets += b.wickets;
        row.wides += b.wides;
        row.noBalls += b.noBalls;
        row.deadBalls += b.deadBalls;
        row.sideRuns += b.sideRuns;
        row.fours += b.fours;
        row.sixes += b.sixes;
        row.net += b.net;
        rows.set(key, row);
      }
    }
    if (any) counted++;
  }
  return { rows: [...rows.values()], matches: counted };
}
