import { describe, expect, it } from "vitest";
import { delayedEvents, liveScore } from "./live";
import { replay, type Ball, type ScoreEvent } from "./scoring";

const setup = { battingFirst: 1 as const };
const ball = (b: Ball): ScoreEvent => ({ type: "ball", ball: b });
/** One over: its bowler, then six balls of `runs` each. */
const over = (runs: number, bowler = "Bowler Name"): ScoreEvent[] => [
  { type: "bowler", name: bowler },
  ...Array.from({ length: 6 }, () => ball({ t: "run", runs, striker: 0 })),
];
const pair: ScoreEvent = { type: "batters", names: ["Batter One", "Batter Two"] };
/** `count` overs worth 6, 12, 18... runs, so each over's total is different. */
const overs = (count: number, from = 1): ScoreEvent[] => Array.from({ length: count }, (_, i) => over(from + i)).flat();
const end: ScoreEvent = { type: "endInnings" };

describe("delayedEvents", () => {
  it("shows nothing until two overs are finished, then stays one finished over behind", () => {
    expect(delayedEvents(setup, [pair, ...over(1), ...over(2).slice(0, 4)])).toEqual([]);
    const afterTwo = [pair, ...overs(2)];
    expect(delayedEvents(setup, afterTwo)).toEqual([pair, ...over(1)]);
    // Part-way through over 4, viewers still stop at the end of over 2.
    expect(delayedEvents(setup, [pair, ...overs(3), ...over(4).slice(0, 3)])).toEqual([pair, ...overs(2)]);
  });

  it("never includes a ball from the held-back over or the over in play", () => {
    const events = [pair, ...overs(3), ...over(9).slice(0, 5)];
    const shown = replay(setup, delayedEvents(setup, events));
    expect(shown.innings[0].overs).toHaveLength(2);
    expect(shown.totals[1]).toBe(6 + 12); // not the 18 from over 3, nor the 9s after it
  });

  it("counts an over cut short by End innings once the innings has ended", () => {
    // Innings 1: 2 full overs, 3 balls of a third, then ended. Innings 2: 1 full over.
    const events = [pair, ...overs(2), ...over(5).slice(0, 4), end, pair, ...over(1)];
    const shown = replay(setup, delayedEvents(setup, events));
    expect(shown.innings[0].complete).toBe(true);
    expect(shown.totals[1]).toBe(6 + 12 + 15);
    expect(shown.innings[1].overs).toHaveLength(0);
  });

  it("can be told to hold back nothing, or more", () => {
    const events = [pair, ...overs(3)];
    expect(delayedEvents(setup, events, 0)).toEqual(events);
    expect(delayedEvents(setup, events, 2)).toEqual([pair, ...over(1)]);
  });
});

describe("liveScore", () => {
  it("starts at nothing, then follows the first innings one over behind", () => {
    expect(liveScore(setup, [pair, ...over(1)])).toEqual({ innings: 1, batting: 1, overs: 0, totals: { 1: 0, 2: 0 }, target: null, awaitingResult: false });
    expect(liveScore(setup, [pair, ...overs(3)])).toMatchObject({ innings: 1, batting: 1, overs: 2, totals: { 1: 18, 2: 0 }, target: null });
  });

  it("holds the last over of the innings through the break, then shows the target", () => {
    const firstInnings = [pair, ...overs(6)]; // 6 + 12 + ... + 36 = 126
    expect(liveScore(setup, firstInnings)).toMatchObject({ innings: 1, overs: 5, totals: { 1: 90, 2: 0 }, target: null });
    expect(liveScore(setup, [...firstInnings, pair, ...over(1).slice(0, 5)])).toMatchObject({ innings: 1, overs: 5, target: null });
    expect(liveScore(setup, [...firstInnings, pair, ...over(1)])).toEqual({
      innings: 2,
      batting: 2,
      overs: 0,
      totals: { 1: 126, 2: 0 },
      target: 127,
      awaitingResult: false,
    });
  });

  it("stops one over short at the end of the match, and says the result is on its way", () => {
    const match = [pair, ...overs(6), pair, ...overs(6)];
    expect(replay(setup, match).finished).toBe(true);
    expect(liveScore(setup, match)).toEqual({ innings: 2, batting: 2, overs: 5, totals: { 1: 126, 2: 90 }, target: 127, awaitingResult: true });
  });

  it("follows the side that bats first when that's team 2, and takes misconduct penalties off", () => {
    const events: ScoreEvent[] = [pair, ...over(2), { type: "penalty", team: 2, runs: 5, note: "Misconduct" }, ...over(3)];
    expect(liveScore({ battingFirst: 2 }, events)).toMatchObject({ innings: 1, batting: 2, overs: 1, totals: { 1: 0, 2: 12 } });
    // The penalty came after the over viewers can see, so it shows with the next one.
    expect(liveScore({ battingFirst: 2 }, [...events, ...over(1)])).toMatchObject({ overs: 2, totals: { 1: 0, 2: 12 + 18 - 5 } });
  });

  it("never carries a batter's or bowler's name", () => {
    const text = JSON.stringify(liveScore(setup, [pair, ...overs(6), pair, ...overs(4)]));
    expect(text).not.toMatch(/Batter|Bowler|One|Two|Name/);
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(["awaitingResult", "batting", "innings", "overs", "target", "totals"]);
  });
});
