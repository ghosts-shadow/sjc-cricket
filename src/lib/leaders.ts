import type { Scorecard } from "./scoring";

/**
 * Player leaderboards: tournament totals per batter and per bowler, the rates worked out from them,
 * and the organisers' MVP score. Pure, so it can be tested; stats.ts loads the matches for it.
 */

/** A submitted match: its replayed scorecard and the two teams it was between (side 1 = home). */
export interface PlayedCard {
  teams: { 1: { id: number; name: string }; 2: { id: number; name: string } };
  card: Scorecard;
}

/** The key a player's tournament totals are kept under: their team and name, ignoring case. */
export const playerKey = (teamId: number, name: string) => `${teamId}:${name.toLowerCase()}`;

interface Player {
  key: string;
  name: string;
  team: string;
  female: boolean;
}

/** One batter's tournament totals. */
export interface BattingRow extends Player {
  innings: number; // matches batted in
  runs: number; // off the bat
  balls: number; // faced
  sideRuns: number; // side runs: 1-3 off the nets and posts
  fours: number;
  sixes: number;
  outs: number;
  net: number; // runs - 5 per out
}

/** One bowler's tournament totals. */
export interface BowlingRow extends Player {
  overs: number;
  balls: number; // legal balls
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

/** One player's batting and bowling together, for the MVP table. */
export interface MvpRow extends Player {
  matches: number; // matches they batted or bowled in
  runs: number; // scored, off the bat
  outs: number;
  given: number; // runs conceded in their overs
  wickets: number;
  extras: number; // wides + no-balls + dead balls they bowled, counted
  mvp: number;
}

export interface Tally {
  batting: BattingRow[];
  bowling: BowlingRow[];
  mvp: MvpRow[];
  /** Matches with at least one batter or bowler named. */
  matches: number;
}

/** Runs per time out. A batter who was never out keeps their runs as the average. */
export const battingAverage = (r: { runs: number; outs: number }) => r.runs / Math.max(r.outs, 1);

/** Runs per 100 balls faced. */
export const battingStrikeRate = (r: { runs: number; balls: number }) => (r.balls ? (r.runs / r.balls) * 100 : 0);

/** Runs conceded per over bowled. */
export const economy = (r: { runs: number; overs: number }) => (r.overs ? r.runs / r.overs : 0);

/** Runs conceded per wicket; null with no wickets. */
export const bowlingAverage = (r: { runs: number; wickets: number }) => (r.wickets ? r.runs / r.wickets : null);

/** Legal balls bowled per wicket; null with no wickets. */
export const bowlingStrikeRate = (r: { balls: number; wickets: number }) => (r.wickets ? r.balls / r.wickets : null);

/** Wides, no-balls and dead balls bowled, counted (not the runs they cost). */
export const extrasBowled = (r: { wides: number; noBalls: number; deadBalls: number }) => r.wides + r.noBalls + r.deadBalls;

/**
 * The organisers' MVP formula (10 Nov 2026):
 * (runs scored - runs given + 5 per wicket - 5 per out - extras) / matches played.
 * Runs given are the bowler's runs conceded, which already include the runs from wides and no-balls;
 * extras are then taken off again as a count, as the formula is written.
 */
export function mvpScore(p: { runs: number; given: number; wickets: number; outs: number; extras: number; matches: number }): number {
  return p.matches ? (p.runs - p.given + 5 * p.wickets - 5 * p.outs - p.extras) / p.matches : 0;
}

/**
 * Add up every submitted match. Players are matched by team and name (case-insensitive), the same way
 * the scorer's dropdowns are. Batting in a match means being named in a pair that batted; bowling
 * means bowling an over. `female` holds the keys of the players who count as female.
 */
export function tally(cards: PlayedCard[], female: ReadonlySet<string>): Tally {
  const batting = new Map<string, BattingRow>();
  const bowling = new Map<string, BowlingRow>();
  const played = new Map<string, Player & { matches: number }>();
  let matches = 0;

  for (const { teams, card } of cards) {
    const inThisMatch = new Map<string, Player>();
    const player = (team: { id: number; name: string }, name: string): Player => {
      const key = playerKey(team.id, name);
      const p = inThisMatch.get(key) ?? { key, name, team: team.name, female: female.has(key) };
      inThisMatch.set(key, p);
      return p;
    };

    for (const inn of card.innings) {
      for (const b of inn.batters) {
        const p = player(teams[inn.battingTeam], b.name);
        const row = batting.get(p.key) ?? { ...p, innings: 0, runs: 0, balls: 0, sideRuns: 0, fours: 0, sixes: 0, outs: 0, net: 0 };
        row.innings++;
        row.runs += b.runs;
        row.balls += b.balls;
        row.sideRuns += b.sideRuns;
        row.fours += b.fours;
        row.sixes += b.sixes;
        row.outs += b.outs;
        row.net += b.net;
        batting.set(p.key, row);
      }
      for (const b of inn.bowlers) {
        const p = player(teams[inn.battingTeam === 1 ? 2 : 1], b.name);
        const row = bowling.get(p.key) ?? {
          ...p,
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
        bowling.set(p.key, row);
      }
    }

    if (inThisMatch.size > 0) matches++;
    for (const p of inThisMatch.values()) {
      const seen = played.get(p.key) ?? { ...p, matches: 0 };
      seen.matches++;
      played.set(p.key, seen);
    }
  }

  const mvp = [...played.values()].map((p): MvpRow => {
    const bat = batting.get(p.key);
    const bowl = bowling.get(p.key);
    const totals = {
      matches: p.matches,
      runs: bat?.runs ?? 0,
      outs: bat?.outs ?? 0,
      given: bowl?.runs ?? 0,
      wickets: bowl?.wickets ?? 0,
      extras: bowl ? extrasBowled(bowl) : 0,
    };
    return { key: p.key, name: p.name, team: p.team, female: p.female, ...totals, mvp: mvpScore(totals) };
  });

  return { batting: [...batting.values()], bowling: [...bowling.values()], mvp, matches };
}

/** One sortable number column of a leaderboard table. */
export interface Column<T> {
  /** The ?sort= value. */
  key: string;
  head: string;
  /** Spelled out, for the header's tooltip and the "sorted by" line. */
  title: string;
  /** What the column sorts by. null (no wickets, say) always sorts last. */
  value: (row: T) => number | null;
  /** What the cell shows, when it isn't just the value. */
  show?: (row: T) => string | number;
  /** "asc" when smaller is better (economy); bigger is better otherwise. */
  best?: "asc";
  /** Rates need a minimum, or one lucky ball tops the list: rows failing this go after the rest, unranked. */
  qualifies?: (row: T) => boolean;
  /** The minimum in words: "12+ balls faced". */
  minimum?: string;
}

/**
 * Sort by one column, best first, and number the rows from 1. Rows that don't qualify for the column,
 * or have no value in it, follow in the same order with rank 0 (shown as a dash).
 */
export function rankBy<T extends { name: string }>(rows: T[], column: Column<T>, tiebreak: (a: T, b: T) => number): (T & { rank: number })[] {
  const direction = column.best === "asc" ? 1 : -1;
  const counts = (row: T) => column.value(row) != null && (column.qualifies?.(row) ?? true);
  const sorted = [...rows].sort((a, b) => {
    if (counts(a) !== counts(b)) return counts(a) ? -1 : 1;
    const va = column.value(a);
    const vb = column.value(b);
    if ((va == null) !== (vb == null)) return va == null ? 1 : -1;
    const byValue = va != null && vb != null ? direction * (va - vb) : 0;
    return byValue || tiebreak(a, b) || a.name.localeCompare(b.name);
  });
  let place = 0;
  return sorted.map((row) => ({ ...row, rank: counts(row) ? ++place : 0 }));
}
