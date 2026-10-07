import { describe, expect, it } from "vitest";
import { namesBySide, parseEvents, parseSetup, replay, summariseOver, swapBattingFirst, type Ball, type ScoreEvent } from "./scoring";

describe("parseEvents / parseSetup", () => {
  it("accepts well-formed events and strips unknown fields", () => {
    const parsed = parseEvents([
      { type: "ball", ball: { t: "run", runs: 4, extra: "x" } },
      { type: "female", on: true },
      { type: "ball", ball: { t: "nb", runs: 2 } },
      { type: "penalty", team: 2, runs: 5, note: "Arguing" },
      { type: "endInnings" },
    ]);
    expect(parsed).toEqual([
      { type: "ball", ball: { t: "run", runs: 4 } },
      { type: "female", on: true },
      { type: "ball", ball: { t: "nb", runs: 2 } },
      { type: "penalty", team: 2, runs: 5, note: "Arguing" },
      { type: "endInnings" },
    ]);
  });

  it("rejects anything malformed", () => {
    expect(parseEvents([{ type: "ball", ball: { t: "run", runs: -1 } }])).toBeNull();
    expect(parseEvents([{ type: "ball", ball: { t: "run", runs: 2.5 } }])).toBeNull();
    expect(parseEvents([{ type: "penalty", team: 1, runs: 50 }])).toBeNull();
    expect(parseEvents([{ type: "hack" }])).toBeNull();
    expect(parseEvents("nope")).toBeNull();
    expect(parseSetup({ battingFirst: 3 })).toBeNull();
    expect(parseSetup({ battingFirst: 2 })).toEqual({ battingFirst: 2 });
  });
});

const run = (runs: number): Ball => ({ t: "run", runs });
const wd: Ball = { t: "wd" };
const db: Ball = { t: "db" };
const nb = (runs = 0): Ball => ({ t: "nb", runs });
const out: Ball = { t: "out" };
const times = (n: number, ball: Ball) => Array.from({ length: n }, () => ball);

describe("summariseOver — rules PDF examples", () => {
  it("normal over: 5 wides, 5 no-balls, 4 dead balls = 8 penalty runs (6 from wides, 2 from dead balls)", () => {
    const over = summariseOver(0, false, [...times(5, wd), ...times(5, nb()), ...times(4, db)]);
    expect(over.penalties).toBe(8);
    expect(over.extras).toBe(10); // 5 wides x 1 + 5 no-balls x 1
    expect(over.legalBalls).toBe(0);
    expect(over.complete).toBe(false);
  });

  it("female over: 5 wides, 5 no-balls, 4 dead balls = 2 penalty runs (dead balls only)", () => {
    const over = summariseOver(0, true, [...times(5, wd), ...times(5, nb()), ...times(4, db)]);
    expect(over.penalties).toBe(2);
    expect(over.extras).toBe(15); // 5 wides x 2 + 5 no-balls x 1
    expect(over.legalBalls).toBe(5); // female wides use up a ball
  });

  it("female over: 6 wides = (2 x 6) + 6 = 18 and the over ends", () => {
    const over = summariseOver(0, true, times(6, wd));
    expect(over.total).toBe(18);
    expect(over.complete).toBe(true);
    expect(over.endedBy).toBe("wd");
  });

  it("normal over: 6th wide ends the over with 2 + 4 + 6 penalties", () => {
    const over = summariseOver(0, false, times(6, wd));
    expect(over.total).toBe(6 + 12);
    expect(over.complete).toBe(true);
    expect(over.legalBalls).toBe(0);
  });

  it("6 no-balls = (6 x 1) + 6 penalty and the over ends; runs off the bat count", () => {
    const over = summariseOver(0, false, [...times(5, nb()), nb(4)]);
    expect(over.total).toBe(6 + 4 + 6);
    expect(over.complete).toBe(true);
    expect(over.endedBy).toBe("nb");
  });

  it("6 dead balls = 2 + 4 + 6 penalty, no runs, over ends", () => {
    const over = summariseOver(0, true, times(6, db));
    expect(over.total).toBe(12);
    expect(over.complete).toBe(true);
  });

  it("up to 3 dead balls add nothing", () => {
    expect(summariseOver(0, false, [...times(3, db), ...times(6, run(1))]).total).toBe(6);
  });

  it("a wicket deducts 5 and voids that ball; the over still needs 6 legal balls", () => {
    const over = summariseOver(0, false, [run(4), out, run(2), run(1), run(0)]);
    expect(over.total).toBe(4 + 2 + 1 - 5);
    expect(over.complete).toBe(false);
    expect(summariseOver(0, false, [...over.balls, run(6)]).complete).toBe(true);
  });

  it("normal-over wides and no-balls are re-bowled, so they don't count toward the 6", () => {
    const over = summariseOver(0, false, [wd, nb(2), run(1), run(1), run(1), run(1), run(1), run(1)]);
    expect(over.legalBalls).toBe(6);
    expect(over.total).toBe(1 + 1 + 2 + 6);
    expect(over.complete).toBe(true);
  });

  it("ignores balls after the over is complete", () => {
    expect(summariseOver(0, false, [...times(6, run(1)), run(6)]).total).toBe(6);
  });

  it("warns on 3 wides in the first 3 balls", () => {
    expect(summariseOver(0, false, times(3, wd)).warning).toMatch(/warning/);
    expect(summariseOver(0, false, [wd, run(1), wd, wd]).warning).toBeNull();
  });
});

describe("replay — whole match", () => {
  const over = (balls: Ball[]): ScoreEvent[] => balls.map((ball) => ({ type: "ball", ball }));
  const sixes = (runs: number) => over(times(6, run(runs)));
  const innings = (runsPerBall: number) => Array.from({ length: 6 }, () => sixes(runsPerBall)).flat();

  it("plays two innings and declares the winner", () => {
    const card = replay({ battingFirst: 2 }, [...innings(1), ...innings(2)]);
    expect(card.innings[0].battingTeam).toBe(2);
    expect(card.totals).toEqual({ 1: 72, 2: 36 });
    expect(card.target).toBe(37);
    expect(card.finished).toBe(true);
    expect(card.result).toEqual({ winner: 1, margin: 36 });
  });

  it("totals overs into pairs (2 overs per pair) and applies female overs", () => {
    const events: ScoreEvent[] = [
      ...sixes(1), // pair 1, over 1: 6
      { type: "female", on: true },
      ...over(times(6, wd)), // pair 1, over 2 (female): 18
      ...sixes(2), // pair 2: 12
      ...sixes(0),
      ...over([out, ...times(5, run(0))]), // pair 3: -5
      ...sixes(1), // pair 3: 6
    ];
    const card = replay({ battingFirst: 1 }, events);
    expect(card.innings[0].overs[1].female).toBe(true);
    expect(card.innings[0].pairTotals).toEqual([24, 12, 1]);
    expect(card.innings[0].complete).toBe(true);
    expect(card.current).toBe(1);
  });

  it("deducts misconduct penalties from the offending team's total", () => {
    const card = replay({ battingFirst: 1 }, [
      ...innings(1),
      { type: "penalty", team: 2, runs: 5, note: "Arguing with umpire" },
      ...innings(1),
    ]);
    expect(card.totals).toEqual({ 1: 36, 2: 31 });
    expect(card.result).toEqual({ winner: 1, margin: 5 });
  });

  it("reports a tie with no winner", () => {
    const card = replay({ battingFirst: 1 }, [...innings(1), ...innings(1)]);
    expect(card.result).toEqual({ winner: null, margin: 0 });
  });

  it("lets the scorer end an innings early and drops an unbowled over", () => {
    const card = replay({ battingFirst: 1 }, [...sixes(1), { type: "female", on: true }, { type: "endInnings" }, ...sixes(2)]);
    expect(card.innings[0].overs).toHaveLength(1);
    expect(card.innings[0].runs).toBe(6);
    expect(card.innings[1].runs).toBe(12);
    expect(card.current).toBe(1);
  });

  it("undo is just dropping the last event", () => {
    const events = [...sixes(1), { type: "ball" as const, ball: run(4) }];
    expect(replay({ battingFirst: 1 }, events).innings[0].runs).toBe(10);
    expect(replay({ battingFirst: 1 }, events.slice(0, -1)).innings[0].runs).toBe(6);
  });

  it("warns when the female pair bats last", () => {
    const events: ScoreEvent[] = [...sixes(1), ...sixes(1), ...sixes(1), ...sixes(1), { type: "female", on: true }, ...sixes(1)];
    expect(replay({ battingFirst: 1 }, events).warnings.join()).toMatch(/1st or 2nd/);
  });
});

describe("batters and bowlers", () => {
  const over = (balls: Ball[]): ScoreEvent[] => balls.map((ball) => ({ type: "ball", ball }));
  const sixes = (runs: number) => over(times(6, run(runs)));

  it("attaches the bowler to the over and the batters to the pair, through later balls", () => {
    const card = replay({ battingFirst: 1 }, [
      { type: "batters", names: ["Anil", "Ben"] },
      { type: "bowler", name: "Xavier" },
      ...sixes(1),
      { type: "bowler", name: "Yusuf" },
      { type: "female", on: true },
      ...sixes(2),
      { type: "batters", names: ["Cara", "Dev"] },
      { type: "bowler", name: "Xavier" },
      ...sixes(0),
    ]);
    const inn = card.innings[0];
    expect(inn.overs.map((o) => o.bowler)).toEqual(["Xavier", "Yusuf", "Xavier"]);
    expect(inn.overs[1].female).toBe(true);
    expect(inn.pairs).toEqual([["Anil", "Ben"], ["Cara", "Dev"], null]);
    expect(inn.runs).toBe(18);
  });

  it("a later bowler event corrects the over being bowled; undo restores the old one", () => {
    const events: ScoreEvent[] = [{ type: "bowler", name: "Xavier" }, ...over([run(1), run(2)]), { type: "bowler", name: "Zed" }];
    expect(replay({ battingFirst: 1 }, events).innings[0].overs[0].bowler).toBe("Zed");
    expect(replay({ battingFirst: 1 }, events.slice(0, -1)).innings[0].overs[0].bowler).toBe("Xavier");
  });

  it("names go to the second innings once the first is over", () => {
    const first = Array.from({ length: 6 }, () => sixes(1)).flat();
    const card = replay({ battingFirst: 2 }, [...first, { type: "batters", names: ["Eli", "Fay"] }, { type: "bowler", name: "Gus" }]);
    expect(card.innings[1].pairs[0]).toEqual(["Eli", "Fay"]);
    expect(card.innings[1].overs[0].bowler).toBe("Gus");
  });

  it("namesBySide puts batters on the batting side and bowlers on the fielding side, without duplicates", () => {
    const card = replay({ battingFirst: 2 }, [
      { type: "batters", names: ["Anil", "Ben"] },
      { type: "bowler", name: "Xavier" },
      ...sixes(1),
      { type: "bowler", name: "xavier" },
      ...sixes(1),
    ]);
    expect(namesBySide(card)).toEqual({ 1: ["Xavier"], 2: ["Anil", "Ben"] });
  });

  it("swapBattingFirst flips the order, keeps balls and penalties, and drops names", () => {
    const events: ScoreEvent[] = [
      { type: "batters", names: ["Anil", "Ben"] },
      { type: "bowler", name: "Xavier" },
      ...over([run(4), run(2)]),
      { type: "penalty", team: 2, runs: 5, note: "Misconduct" },
    ];
    const swapped = swapBattingFirst({ battingFirst: 1 }, events);
    expect(swapped.setup).toEqual({ battingFirst: 2 });
    expect(swapped.events).toEqual([...over([run(4), run(2)]), { type: "penalty", team: 2, runs: 5, note: "Misconduct" }]);

    const card = replay(swapped.setup, swapped.events);
    expect(card.innings[0].battingTeam).toBe(2);
    expect(card.innings[0].runs).toBe(6); // the balls now count for team 2
    expect(card.totals).toEqual({ 1: 0, 2: 1 }); // and team 2 still carries its own -5 penalty
    expect(card.innings[0].pairs[0]).toBeNull();
  });

  it("parseEvents cleans names and rejects bad ones", () => {
    expect(parseEvents([{ type: "bowler", name: "  Joe   Root " }, { type: "batters", names: ["A", " B "] }])).toEqual([
      { type: "bowler", name: "Joe Root" },
      { type: "batters", names: ["A", "B"] },
    ]);
    expect(parseEvents([{ type: "bowler", name: "   " }])).toBeNull();
    expect(parseEvents([{ type: "bowler", name: "x".repeat(41) }])).toBeNull();
    expect(parseEvents([{ type: "batters", names: ["Only one"] }])).toBeNull();
    expect(parseEvents([{ type: "batters", names: ["A", 7] }])).toBeNull();
  });
});
