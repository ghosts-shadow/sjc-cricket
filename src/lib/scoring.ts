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
  | { t: "out" } // legal ball; -5 from the pair, runs on that ball are void
  | { t: "wd" } // wide
  | { t: "nb"; runs: number } // no-ball; runs = runs off the bat on that ball
  | { t: "db" }; // dead ball

export type ScoreEvent =
  | { type: "ball"; ball: Ball }
  | { type: "female"; on: boolean } // sets the kind of the current over before its first ball
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

export function summariseOver(index: number, female: boolean, balls: Ball[]): OverCard {
  const card: OverCard = {
    index,
    pair: Math.floor(index / 2),
    female,
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
        card.legalBalls++;
        card.wickets++;
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
        card.noBalls++;
        card.extras += 1;
        card.batRuns += ball.runs;
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
      else if (b.t === "nb" && runs(b.runs)) events.push({ type: "ball", ball: { t: "nb", runs: b.runs as number } });
      else if (b.t === "out" || b.t === "wd" || b.t === "db") events.push({ type: "ball", ball: { t: b.t } });
      else return null;
    } else if (e.type === "female" && typeof e.on === "boolean") {
      events.push({ type: "female", on: e.on });
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
  return { battingTeam, overs: [], pairTotals: [0, 0, 0], runs: 0, complete: false };
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
        if (over.balls.length === 0) Object.assign(over, summariseOver(over.index, event.on, []));
        break;
      }
      case "ball": {
        const over = activeOver(inn);
        Object.assign(over, summariseOver(over.index, over.female, [...over.balls, event.ball]));
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
