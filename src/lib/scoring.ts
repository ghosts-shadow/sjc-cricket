/**
 * SJC Sports Fest indoor-cricket scoring rules (Revised Rules 20.09.2026).
 *
 * A match is a list of events. The scorecard is always rebuilt by replaying them,
 * so "undo" is just dropping the last event. Pure: no React, no database.
 *
 * Format: 6 players, 3 batting pairs, each pair bats 2 overs (6 overs per innings).
 * Each over is either a normal over or a "female over" (female bowler to female batter).
 */

export type Ball =
  | { t: "run"; runs: number } // legal ball; runs include bonus runs off the nets
  // legal ball; -5 from the pair. Caught/bowled etc.: no runs. Run out: runs = runs completed, which count.
  | { t: "out"; runs?: number }
  | { t: "wd" } // wide
  | { t: "nb"; runs: number; out?: boolean } // no-ball; runs = runs off the bat (or completed, if run out)
  | { t: "db" }; // dead ball

export type PairNames = [string, string];

export type ScoreEvent =
  | { type: "ball"; ball: Ball }
  | { type: "female"; on: boolean } // sets the kind of the current over before its first ball
  | { type: "batters"; names: PairNames } // the pair batting the current over's pair slot
  | { type: "bowler"; name: string } // who bowls the current over (later events correct it)
  | { type: "penalty"; team: 1 | 2; runs: number; note?: string } // deducted from that team's total
  | { type: "endInnings" };

export interface ScoringSetup {
  /** Which match side (team 1 or team 2) bats first. */
  battingFirst: 1 | 2;
}

export const OVERS_PER_INNINGS = 6;
export const BALLS_PER_OVER = 6;
export const WICKET_DEDUCTION = 5;

export interface OverCard {
  index: number; // 0-5
  pair: number; // 0-2
  female: boolean;
  bowler: string | null;
  balls: Ball[];
  legalBalls: number;
  batRuns: number;
  extras: number; // wide / no-ball runs
  penalties: number; // escalation penalty runs awarded to the batting side
  wickets: number;
  wides: number;
  noBalls: number;
  deadBalls: number;
  total: number; // batRuns + extras + penalties - 5 * wickets
  complete: boolean;
  /** Set when the over ended early on a 6th wide / no-ball / dead ball. */
  endedBy: "wd" | "nb" | "db" | null;
  warning: string | null;
}

export interface InningsCard {
  battingTeam: 1 | 2;
  overs: OverCard[];
  /** Batters for each of the 3 pairs, once the scorer has entered them. */
  pairs: [PairNames | null, PairNames | null, PairNames | null];
  pairTotals: [number, number, number];
  runs: number; // sum of overs (before misconduct penalties)
  complete: boolean;
}

export interface Scorecard {
  innings: [InningsCard, InningsCard];
  /** 0 or 1 = innings in progress, 2 = match finished. */
  current: 0 | 1 | 2;
  penalties: { team: 1 | 2; runs: number; note?: string }[];
  /** Final team totals: innings runs minus penalties against that team. */
  totals: { 1: number; 2: number };
  /** Final total the team batting second must reach to win (once the first innings is complete). */
  target: number | null;
  finished: boolean;
  /** null while in progress; winner null = tie. */
  result: { winner: 1 | 2 | null; margin: number } | null;
  warnings: string[];
}

/** Escalating penalty added on the 4th, 5th and 6th wide (normal overs) or dead ball (all overs). */
const ESCALATION: Record<number, number> = { 4: 2, 5: 4, 6: 6 };

export function summariseOver(index: number, female: boolean, balls: Ball[], bowler: string | null = null): OverCard {
  const card: OverCard = {
    index,
    pair: Math.floor(index / 2),
    female,
    bowler,
    balls,
    legalBalls: 0,
    batRuns: 0,
    extras: 0,
    penalties: 0,
    wickets: 0,
    wides: 0,
    noBalls: 0,
    deadBalls: 0,
    total: 0,
    complete: false,
    endedBy: null,
    warning: null,
  };

  for (const ball of balls) {
    if (card.complete) break;
    switch (ball.t) {
      case "run":
        card.legalBalls++;
        card.batRuns += ball.runs;
        break;
      case "out":
        // -5 for the wicket. A run out keeps the runs completed before it (organisers, 10 Oct).
        card.legalBalls++;
        card.wickets++;
        card.batRuns += ball.runs ?? 0;
        break;
      case "wd":
        card.wides++;
        if (female) {
          // Female over: 2 runs per wide, no re-ball (the wide uses up a ball).
          card.extras += 2;
          card.legalBalls++;
          if (card.wides === 6) {
            card.penalties += 6;
            card.complete = true;
            card.endedBy = "wd";
          }
        } else {
          // Normal over: 1 run + re-ball, escalating penalties from the 4th wide.
          card.extras += 1;
          card.penalties += ESCALATION[card.wides] ?? 0;
          if (card.wides === 6) {
            card.complete = true;
            card.endedBy = "wd";
          }
        }
        break;
      case "nb":
        // 1 run + runs off the bat + re-ball. 6th no-ball: 6 penalty runs, over ends.
        // Run out on a no-ball (allowed, organisers 10 Oct): still 1 run + the runs completed, still
        // re-bowled, and -5 for the wicket.
        card.noBalls++;
        card.extras += 1;
        card.batRuns += ball.runs;
        if (ball.out) card.wickets++;
        if (card.noBalls === 6) {
          card.penalties += 6;
          card.complete = true;
          card.endedBy = "nb";
        }
        break;
      case "db":
        // No runs, re-ball. Escalating penalties from the 4th dead ball.
        card.deadBalls++;
        card.penalties += ESCALATION[card.deadBalls] ?? 0;
        if (card.deadBalls === 6) {
          card.complete = true;
          card.endedBy = "db";
        }
        break;
    }
    if (card.legalBalls >= BALLS_PER_OVER) card.complete = true;
  }

  if (balls.length >= 3 && balls.slice(0, 3).every((b) => b.t === "wd")) {
    card.warning = "3 wides in the first 3 balls: first and final warning to the bowling captain";
  }
  card.total = card.batRuns + card.extras + card.penalties - WICKET_DEDUCTION * card.wickets;
  return card;
}

export const MAX_NAME_LENGTH = 40;

/** Trim and collapse spaces; null if the result is empty or too long. */
export function cleanName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
}

/** Validate events coming from a scorer's phone before storing or replaying them. */
export function parseEvents(input: unknown): ScoreEvent[] | null {
  if (!Array.isArray(input) || input.length > 1000) return null;
  const runs = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 12;
  const events: ScoreEvent[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return null;
    const e = raw as Record<string, unknown>;
    if (e.type === "ball") {
      const b = e.ball as Record<string, unknown> | null;
      if (!b || typeof b !== "object") return null;
      if (b.t === "run" && runs(b.runs)) events.push({ type: "ball", ball: { t: "run", runs: b.runs as number } });
      else if (b.t === "nb" && runs(b.runs)) {
        const n = b.runs as number;
        events.push({ type: "ball", ball: b.out === true ? { t: "nb", runs: n, out: true } : { t: "nb", runs: n } });
      } else if (b.t === "out") {
        // runs only on a run out; a plain wicket has none
        if (b.runs === undefined || b.runs === 0) events.push({ type: "ball", ball: { t: "out" } });
        else if (runs(b.runs)) events.push({ type: "ball", ball: { t: "out", runs: b.runs as number } });
        else return null;
      } else if (b.t === "wd" || b.t === "db") events.push({ type: "ball", ball: { t: b.t } });
      else return null;
    } else if (e.type === "female" && typeof e.on === "boolean") {
      events.push({ type: "female", on: e.on });
    } else if (e.type === "batters" && Array.isArray(e.names) && e.names.length === 2) {
      const [a, b] = e.names.map(cleanName);
      if (!a || !b) return null;
      events.push({ type: "batters", names: [a, b] });
    } else if (e.type === "bowler") {
      const name = cleanName(e.name);
      if (!name) return null;
      events.push({ type: "bowler", name });
    } else if (e.type === "penalty" && (e.team === 1 || e.team === 2) && e.runs === WICKET_DEDUCTION) {
      events.push({ type: "penalty", team: e.team, runs: WICKET_DEDUCTION, note: typeof e.note === "string" ? e.note.slice(0, 100) : undefined });
    } else if (e.type === "endInnings") {
      events.push({ type: "endInnings" });
    } else {
      return null;
    }
  }
  return events;
}

export function parseSetup(input: unknown): ScoringSetup | null {
  const s = input as Record<string, unknown> | null;
  return s && (s.battingFirst === 1 || s.battingFirst === 2) ? { battingFirst: s.battingFirst } : null;
}

function newInnings(battingTeam: 1 | 2): InningsCard {
  return { battingTeam, overs: [], pairs: [null, null, null], pairTotals: [0, 0, 0], runs: 0, complete: false };
}

export function replay(setup: ScoringSetup, events: ScoreEvent[]): Scorecard {
  const other = (setup.battingFirst === 1 ? 2 : 1) as 1 | 2;
  const innings: [InningsCard, InningsCard] = [newInnings(setup.battingFirst), newInnings(other)];
  const penalties: Scorecard["penalties"] = [];
  // Cast so TypeScript doesn't narrow to 0: closeInnings() advances it inside a closure.
  let current = 0 as 0 | 1 | 2;

  // Over currently being bowled in the active innings, opening a new one when needed.
  const activeOver = (inn: InningsCard): OverCard => {
    const last = inn.overs[inn.overs.length - 1];
    if (last && !last.complete) return last;
    const over = summariseOver(inn.overs.length, false, []);
    inn.overs.push(over);
    return over;
  };

  const closeInnings = () => {
    innings[current as 0 | 1].complete = true;
    current = (current + 1) as 0 | 1 | 2;
  };

  for (const event of events) {
    if (current === 2) break;
    const inn = innings[current];
    switch (event.type) {
      case "female": {
        const over = activeOver(inn);
        if (over.balls.length === 0) Object.assign(over, summariseOver(over.index, event.on, [], over.bowler));
        break;
      }
      case "batters":
        inn.pairs[activeOver(inn).pair] = event.names;
        break;
      case "bowler":
        activeOver(inn).bowler = event.name;
        break;
      case "ball": {
        const over = activeOver(inn);
        Object.assign(over, summariseOver(over.index, over.female, [...over.balls, event.ball], over.bowler));
        if (over.complete && inn.overs.length === OVERS_PER_INNINGS) closeInnings();
        break;
      }
      case "penalty":
        penalties.push({ team: event.team, runs: event.runs, note: event.note });
        break;
      case "endInnings": {
        // Drop an over that was opened but never bowled.
        const last = inn.overs[inn.overs.length - 1];
        if (last && last.balls.length === 0) inn.overs.pop();
        closeInnings();
        break;
      }
    }
  }

  const warnings: string[] = [];
  for (const inn of innings) {
    inn.pairTotals = [0, 0, 0];
    for (const over of inn.overs) inn.pairTotals[over.pair] += over.total;
    inn.runs = inn.pairTotals[0] + inn.pairTotals[1] + inn.pairTotals[2];
    for (const over of inn.overs) {
      if (over.warning) warnings.push(`Team ${inn.battingTeam}, over ${over.index + 1}: ${over.warning}`);
    }
    if (inn.overs.some((o) => o.female && o.pair === 2 && o.balls.length > 0)) {
      warnings.push(`Team ${inn.battingTeam}: the pair with the female player must bat 1st or 2nd, not last`);
    }
  }

  const runsFor = (team: 1 | 2) => innings.find((i) => i.battingTeam === team)!.runs;
  const deducted = (team: 1 | 2) => penalties.filter((p) => p.team === team).reduce((sum, p) => sum + p.runs, 0);
  const totals = { 1: runsFor(1) - deducted(1), 2: runsFor(2) - deducted(2) };

  const finished = current === 2;
  let result: Scorecard["result"] = null;
  if (finished) {
    const diff = totals[1] - totals[2];
    result = { winner: diff === 0 ? null : diff > 0 ? 1 : 2, margin: Math.abs(diff) };
  }
  const target = innings[0].complete ? totals[innings[0].battingTeam] + 1 : null;

  return { innings, current, penalties, totals, target, finished, result, warnings };
}

/**
 * Fix a wrong toss: the other team bats first. Balls already scored move with the batting order
 * (that's the point of the fix), but batter and bowler names were picked from the wrong teams'
 * lists, so they're dropped. Penalties stay with the team they were given to.
 */
export function swapBattingFirst(setup: ScoringSetup, events: ScoreEvent[]): { setup: ScoringSetup; events: ScoreEvent[] } {
  return {
    setup: { battingFirst: setup.battingFirst === 1 ? 2 : 1 },
    events: events.filter((e) => e.type !== "batters" && e.type !== "bowler"),
  };
}

/** Every player name in a scorecard, by side: batters belong to the batting side, bowlers to the other. */
export function namesBySide(card: Scorecard): { 1: string[]; 2: string[] } {
  const names = { 1: new Map<string, string>(), 2: new Map<string, string>() };
  const add = (side: 1 | 2, name: string) => {
    if (!names[side].has(name.toLowerCase())) names[side].set(name.toLowerCase(), name);
  };
  for (const inn of card.innings) {
    const fielding = inn.battingTeam === 1 ? 2 : 1;
    for (const pair of inn.pairs) pair?.forEach((n) => add(inn.battingTeam, n));
    for (const over of inn.overs) if (over.bowler) add(fielding, over.bowler);
  }
  return { 1: [...names[1].values()], 2: [...names[2].values()] };
}
