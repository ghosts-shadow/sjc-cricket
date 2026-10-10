import { describe, expect, it } from "vitest";
import {
  defaultStriker,
  namesBySide,
  parseEvents,
  parseSetup,
  replay,
  summariseOver,
  swapBattingFirst,
  type Ball,
  type ScoreEvent,
} from "./scoring";

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

  it("run out on a no-ball: 1 no-ball run + runs completed, -5 for the wicket, and it's re-bowled", () => {
    const card = summariseOver(0, false, [{ t: "nb", runs: 2, out: true }, ...times(6, run(1))]);
    expect(card.noBalls).toBe(1);
    expect(card.wickets).toBe(1);
    expect(card.legalBalls).toBe(6); // the no-ball didn't use up a ball
    expect(card.total).toBe(1 + 2 + 6 - 5);
    expect(parseEvents([{ type: "ball", ball: { t: "nb", runs: 3, out: true } }])).toEqual([
      { type: "ball", ball: { t: "nb", runs: 3, out: true } },
    ]);
  });

  it("run out on a legal ball: runs completed count, -5 for the wicket, and it uses up the ball", () => {
    const card = summariseOver(0, false, [{ t: "out", runs: 2 }, ...times(5, run(1))]);
    expect(card.wickets).toBe(1);
    expect(card.legalBalls).toBe(6);
    expect(card.complete).toBe(true);
    expect(card.total).toBe(2 + 5 - 5);
    // A plain wicket still has no runs, and old events without runs replay the same.
    expect(summariseOver(0, false, [out, ...times(5, run(1))]).total).toBe(5 - 5);
    expect(parseEvents([{ type: "ball", ball: { t: "out", runs: 3 } }, { type: "ball", ball: { t: "out", runs: 0 } }])).toEqual([
      { type: "ball", ball: { t: "out", runs: 3 } },
      { type: "ball", ball: { t: "out" } },
    ]);
    expect(parseEvents([{ type: "ball", ball: { t: "out", runs: -1 } }])).toBeNull();
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

describe("per-batter scores", () => {
  const balls = (list: Ball[]): ScoreEvent[] => list.map((ball) => ({ type: "ball", ball }));
  // A ball off the bat for batter 0 (a) or 1 (b): running runs, plus an optional bonus ("boundary").
  const a = (running: number, bonus = 0): Ball => ({ t: "run", runs: bonus + running, striker: 0, ...(bonus ? { bonus } : {}) });
  const b = (running: number, bonus = 0): Ball => ({ t: "run", runs: bonus + running, striker: 1, ...(bonus ? { bonus } : {}) });
  const start: ScoreEvent[] = [
    { type: "batters", names: ["Anil", "Ben"] },
    { type: "bowler", name: "Xavier" },
  ];

  it("credits runs, balls faced and boundary runs to the striker; wides and dead balls to nobody", () => {
    const card = replay({ battingFirst: 1 }, [
      ...start,
      ...balls([a(0, 4), wd, a(1, 2), b(0, 6), db, b(2), b(4), { t: "nb", runs: 3, bonus: 2, striker: 1 }, a(0)]),
    ]);
    const [anil, ben] = card.innings[0].batters;
    expect(anil).toMatchObject({ name: "Anil", pair: 0, runs: 7, balls: 3, bonusRuns: 6, fours: 1, sixes: 0, outs: 0, net: 7 });
    // Ben's 4 is all running, not a back-net four. The no-ball (2+1) counts as a ball faced.
    expect(ben).toMatchObject({ name: "Ben", runs: 15, balls: 4, bonusRuns: 8, fours: 0, sixes: 1, outs: 0, net: 15 });
    expect(card.innings[0].unattributed).toBe(0);
  });

  it("a catch is -5 with no runs; a run out credits the runs to the striker and the out to whoever was run out", () => {
    const card = replay({ battingFirst: 1 }, [
      ...start,
      ...balls([
        { t: "out", striker: 0 }, // Anil caught
        { t: "out", runs: 2, striker: 0, runOut: true, nonStriker: true }, // Anil ran 2, Ben run out at the other end
        { t: "nb", runs: 1, out: true, striker: 1 }, // Ben run out off a no-ball after 1
        { t: "out", striker: 1, runOut: true }, // Ben run out going for the first run
      ]),
    ]);
    const [anil, ben] = card.innings[0].batters;
    expect(anil).toMatchObject({ runs: 2, balls: 2, outs: 1, net: -3 });
    expect(ben).toMatchObject({ runs: 1, balls: 2, outs: 3, net: -14 });
    expect(card.innings[0].dismissals).toEqual([
      { over: 0, pair: 0, batter: "Anil", runOut: false, runs: 0, noBall: false },
      { over: 0, pair: 0, batter: "Ben", runOut: true, runs: 2, noBall: false },
      { over: 0, pair: 0, batter: "Ben", runOut: true, runs: 1, noBall: true },
      { over: 0, pair: 0, batter: "Ben", runOut: true, runs: 0, noBall: false },
    ]);
  });

  it("lists wickets from before per-batter scoring too, without a name", () => {
    const card = replay({ battingFirst: 1 }, [...start, ...balls([out, { t: "out", runs: 1 }])]);
    expect(card.innings[0].dismissals).toEqual([
      { over: 0, pair: 0, batter: null, runOut: false, runs: 0, noBall: false },
      // No runOut flag back then, but runs completed only happen on a run out.
      { over: 0, pair: 0, batter: null, runOut: true, runs: 1, noBall: false },
    ]);
  });

  it("batters' net runs plus extras and penalties add up to the innings total", () => {
    const card = replay({ battingFirst: 1 }, [
      ...start,
      ...balls([a(3), wd, wd, wd, wd, b(1), { t: "out", striker: 1 }, a(2), b(0, 6), a(1)]),
      { type: "bowler", name: "Yusuf" },
      { type: "female", on: true },
      ...balls([b(2), wd, { t: "nb", runs: 1, striker: 1 }, b(0), db]),
    ]);
    const inn = card.innings[0];
    const nets = inn.batters.reduce((sum, x) => sum + x.net, 0);
    const extras = inn.overs.reduce((sum, o) => sum + o.extras + o.penalties, 0);
    expect(inn.runs).toBe(20);
    expect(nets + extras).toBe(inn.runs);
  });

  it("old balls without a striker replay the same and are counted as unattributed", () => {
    const old = replay({ battingFirst: 1 }, [...start, ...balls([run(4), wd, out, nb(2), db])]);
    expect(old.innings[0].runs).toBe(4 + 1 - 5 + 1 + 2);
    expect(old.innings[0].unattributed).toBe(3);
    expect(old.innings[0].batters.every((x) => x.balls === 0 && x.runs === 0)).toBe(true);
    // No pair names at all: no batter lines.
    expect(replay({ battingFirst: 1 }, balls([a(1)])).innings[0]).toMatchObject({ batters: [], unattributed: 1 });
  });

  it("parseEvents keeps striker, bonus and run-out detail, and drops nonsense without failing", () => {
    expect(
      parseEvents([
        { type: "ball", ball: { t: "run", runs: 3, striker: 1, bonus: 2 } },
        { type: "ball", ball: { t: "run", runs: 6, striker: 0, bonus: 6 } },
        { type: "ball", ball: { t: "run", runs: 3, bonus: 5 } }, // 5 is no bonus value
        { type: "ball", ball: { t: "run", runs: 1, bonus: 2 } }, // bonus can't exceed the runs
        { type: "ball", ball: { t: "run", runs: 1, striker: 2, boundary: true } },
        { type: "ball", ball: { t: "out", runs: 2, striker: 0, nonStriker: true } },
        { type: "ball", ball: { t: "out", runs: 0, striker: 1, runOut: true } },
        { type: "ball", ball: { t: "out", striker: 1, runOut: "yes" } },
        { type: "ball", ball: { t: "nb", runs: 4, striker: 1, bonus: 4 } },
        { type: "ball", ball: { t: "nb", runs: 1, out: true, striker: 1, bonus: 1, nonStriker: true } },
      ]),
    ).toEqual([
      { type: "ball", ball: { t: "run", runs: 3, striker: 1, bonus: 2 } },
      { type: "ball", ball: { t: "run", runs: 6, striker: 0, bonus: 6 } },
      { type: "ball", ball: { t: "run", runs: 3 } },
      { type: "ball", ball: { t: "run", runs: 1 } },
      { type: "ball", ball: { t: "run", runs: 1 } },
      { type: "ball", ball: { t: "out", runs: 2, striker: 0, nonStriker: true } },
      { type: "ball", ball: { t: "out", striker: 1, runOut: true } },
      { type: "ball", ball: { t: "out", striker: 1 } },
      { type: "ball", ball: { t: "nb", runs: 4, striker: 1, bonus: 4 } },
      { type: "ball", ball: { t: "nb", runs: 1, out: true, striker: 1, nonStriker: true } },
    ]);
  });

  it("swapBattingFirst drops who was on strike along with the names, but keeps the bonus split", () => {
    const swapped = swapBattingFirst({ battingFirst: 1 }, [...start, ...balls([a(1, 2), { t: "out", striker: 1, runOut: true, nonStriker: true }])]);
    expect(swapped.events).toEqual(balls([{ t: "run", runs: 3, bonus: 2 }, { t: "out", runOut: true }]));
  });

  describe("defaultStriker", () => {
    const inningsOf = (events: ScoreEvent[]) => replay({ battingFirst: 1 }, events).innings[0];
    const female: ScoreEvent = { type: "female", on: true };
    const nextBowler: ScoreEvent = { type: "bowler", name: "Yusuf" };

    it("asks at the start of a pair", () => {
      expect(defaultStriker(inningsOf(start), 0)).toEqual({ striker: null, locked: false });
    });

    it("changes ends on odd running runs only, run outs included; not on boundary runs or wides", () => {
      const after = (...list: Ball[]) => defaultStriker(inningsOf([...start, ...balls(list)]), 0).striker;
      expect(after(a(1))).toBe(1); // a single: Ben faces next
      expect(after(a(2))).toBe(0);
      expect(after(a(1, 2))).toBe(1); // "2+1": the 1 was run
      expect(after(a(0, 2))).toBe(0); // "2+0": bonus only, nobody ran
      expect(after(a(0, 4))).toBe(0);
      expect(after(a(3), wd)).toBe(1); // a wide changes nothing
      expect(after({ t: "nb", runs: 1, striker: 0 })).toBe(1); // ran 1 off a no-ball
      expect(after({ t: "out", striker: 0 })).toBe(0); // caught: nobody ran
      expect(after({ t: "out", runs: 1, striker: 0, runOut: true })).toBe(1); // run out after 1: they had crossed
      expect(after({ t: "out", runs: 1, striker: 0, runOut: true, nonStriker: true })).toBe(1); // whoever was out
      expect(after({ t: "out", runs: 2, striker: 0, runOut: true })).toBe(0);
      expect(after({ t: "out", striker: 0, runOut: true })).toBe(0); // run out going for the first run
      expect(after({ t: "nb", runs: 1, out: true, striker: 0 })).toBe(1); // no-ball run out after 1
    });

    it("never changes ends after a run out in a mixed pair", () => {
      const inn = inningsOf([...start, female, ...balls(times(6, b(1))), nextBowler, ...balls([{ t: "out", runs: 1, striker: 0, runOut: true }])]);
      expect(defaultStriker(inn, 1)).toEqual({ striker: 0, locked: false });
    });

    it("carries strike into the pair's next over (all bowling is from one end)", () => {
      expect(defaultStriker(inningsOf([...start, ...balls([...times(5, a(2)), a(1)]), nextBowler]), 1).striker).toBe(1);
      expect(defaultStriker(inningsOf([...start, ...balls([...times(5, a(2)), a(0, 2)]), nextBowler]), 1).striker).toBe(0);
    });

    it("locks a female over to its first striker, with no change of ends", () => {
      const inn = inningsOf([...start, female, ...balls([b(1), wd, b(3)])]);
      expect(defaultStriker(inn, 0)).toEqual({ striker: 1, locked: true });
    });

    it("a mixed pair's other over starts on the partner and never changes ends", () => {
      const femaleFirst = [...start, female, ...balls(times(6, b(1))), nextBowler];
      expect(defaultStriker(inningsOf(femaleFirst), 1)).toEqual({ striker: 0, locked: false });
      // He takes a single and stays on strike.
      expect(defaultStriker(inningsOf([...femaleFirst, ...balls([a(1)])]), 1)).toEqual({ striker: 0, locked: false });
      // Male over first, then a female over: the female batter is the one who didn't face it.
      const femaleSecond = [...start, ...balls(times(6, a(2))), nextBowler, female];
      expect(defaultStriker(inningsOf(femaleSecond), 1)).toEqual({ striker: 1, locked: false });
    });

    it("a new pair starts with no striker", () => {
      const events = [
        ...start,
        ...balls(times(12, a(2))),
        { type: "batters", names: ["Cara", "Dev"] } as ScoreEvent,
        { type: "bowler", name: "Zed" } as ScoreEvent,
      ];
      expect(defaultStriker(inningsOf(events), 2)).toEqual({ striker: null, locked: false });
    });
  });
});
