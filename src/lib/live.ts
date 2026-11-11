import { replay, type Scorecard, type ScoreEvent, type ScoringSetup } from "./scoring";

/**
 * Public live scores. Viewers follow a match while it's being scored, but an over behind the play, so
 * the scorer can fix a mistake with Undo before anyone sees it (Lost, 10 Nov 2026). Pure, so it can
 * be tested; data.ts loads the sessions for it.
 */

/** An over is shown only once this many later overs have finished. */
export const LIVE_OVERS_BEHIND = 1;

/** An over that is over: bowled out, or cut short when its innings ended. */
const isFinished = (inn: Scorecard["innings"][number]) => (over: Scorecard["innings"][number]["overs"][number]) =>
  over.complete || (inn.complete && over.balls.length > 0);

function finishedOvers(card: Scorecard): number {
  return card.innings.reduce((count, inn) => count + inn.overs.filter(isFinished(inn)).length, 0);
}

/**
 * The scorer's events up to the end of the last over viewers may see. Nothing from a later over is in
 * the result, so nothing later can reach a public page.
 */
export function delayedEvents(setup: ScoringSetup, events: ScoreEvent[], behind = LIVE_OVERS_BEHIND): ScoreEvent[] {
  const want = finishedOvers(replay(setup, events)) - behind;
  if (want <= 0) return [];
  // The shortest run of events with that many finished overs. The count never goes down as events are
  // added, and one event finishes at most one over, so a binary search lands exactly on its last ball.
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (finishedOvers(replay(setup, events.slice(0, mid))) >= want) high = mid;
    else low = mid + 1;
  }
  return events.slice(0, low);
}

/** What viewers may see of a match being scored: team totals and overs, never a name. */
export interface LiveScore {
  /** The innings viewers are looking at. */
  innings: 1 | 2;
  /** The side batting in it (1 = the match's first-named team). */
  batting: 1 | 2;
  /** Finished overs shown in that innings. */
  overs: number;
  /** Each side's total as viewers see it. */
  totals: { 1: number; 2: number };
  /** What the side batting second must reach to win, once viewers can see the whole first innings. */
  target: number | null;
  /** The scorer has every ball in: the result shows once it's submitted. */
  awaitingResult: boolean;
}

/** The delayed score of a match in progress. Built from the delayed events only. */
export function liveScore(setup: ScoringSetup, events: ScoreEvent[]): LiveScore {
  const shown = replay(setup, delayedEvents(setup, events));
  const index = shown.current === 2 ? 1 : shown.current;
  const inn = shown.innings[index];
  return {
    innings: (index + 1) as 1 | 2,
    batting: inn.battingTeam,
    overs: inn.overs.filter(isFinished(inn)).length,
    totals: { 1: shown.totals[1], 2: shown.totals[2] },
    target: shown.target,
    awaitingResult: replay(setup, events).finished,
  };
}
