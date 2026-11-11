import { describe, expect, it } from "vitest";
import {
  battedAlready,
  bowledAlready,
  correctBall,
  defaultStriker,
  EDIT_MOVES_BALLS,
  facedBy,
  femaleOverPlayers,
  isRunOut,
  isWicket,
  namesBySide,
  parseEvents,
  parseSetup,
  replaceBalls,
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
    expect(anil).toMatchObject({ name: "Anil", pair: 0, runs: 7, balls: 3, sideRuns: 2, fours: 1, sixes: 0, outs: 0, net: 7 });
    // Ben's 4 is all running, not a back-net four. The no-ball (2+1) counts as a ball faced.
    expect(ben).toMatchObject({ name: "Ben", runs: 15, balls: 4, sideRuns: 2, fours: 0, sixes: 1, outs: 0, net: 15 });
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
      { over: 0, pair: 0, batter: "Anil", how: "out", runs: 0, bonus: 0, noBall: false, wide: false },
      { over: 0, pair: 0, batter: "Ben", how: "run out", runs: 2, bonus: 0, noBall: false, wide: false },
      { over: 0, pair: 0, batter: "Ben", how: "run out", runs: 1, bonus: 0, noBall: true, wide: false },
      { over: 0, pair: 0, batter: "Ben", how: "run out", runs: 0, bonus: 0, noBall: false, wide: false },
    ]);
  });

  it("lists wickets from before per-batter scoring too, without a name", () => {
    const card = replay({ battingFirst: 1 }, [...start, ...balls([out, { t: "out", runs: 1 }])]);
    expect(card.innings[0].dismissals).toEqual([
      { over: 0, pair: 0, batter: null, how: "out", runs: 0, bonus: 0, noBall: false, wide: false },
      // No runOut flag back then, but runs completed only happen on a run out.
      { over: 0, pair: 0, batter: null, how: "run out", runs: 1, bonus: 0, noBall: false, wide: false },
    ]);
  });

  it("a run out can follow a boundary off the nets: (2+1) then run out keeps all 3 runs", () => {
    const card = replay({ battingFirst: 1 }, [
      ...start,
      ...balls([
        { t: "out", runs: 3, bonus: 2, striker: 0, runOut: true, nonStriker: true }, // 2 off the side net, ran 1, Ben run out
        { t: "nb", runs: 2, bonus: 1, out: true, striker: 1 }, // no-ball: 1 off the post, ran 1, Ben run out
      ]),
    ]);
    const inn = card.innings[0];
    expect(inn.overs[0].total).toBe(3 - 5 + (1 + 2) - 5);
    expect(inn.batters[0]).toMatchObject({ name: "Anil", runs: 3, sideRuns: 2, outs: 0 });
    expect(inn.batters[1]).toMatchObject({ name: "Ben", runs: 2, sideRuns: 1, outs: 2 });
    expect(inn.dismissals.map((d) => [d.batter, d.how, d.runs, d.bonus])).toEqual([
      ["Ben", "run out", 3, 2],
      ["Ben", "run out", 2, 1],
    ]);
    // Only the 1 run they ran counts for strike, so after the first ball they had crossed.
    const afterFirst = replay({ battingFirst: 1 }, [...start, ...balls([{ t: "out", runs: 3, bonus: 2, striker: 0, runOut: true }])]);
    expect(defaultStriker(afterFirst.innings[0], 0).striker).toBe(1);
    expect(
      parseEvents([
        { type: "ball", ball: { t: "out", runs: 3, bonus: 2, striker: 0, runOut: true } },
        { type: "ball", ball: { t: "nb", runs: 2, bonus: 1, out: true, striker: 1 } },
      ]),
    ).toEqual([
      { type: "ball", ball: { t: "out", runs: 3, bonus: 2, striker: 0, runOut: true } },
      { type: "ball", ball: { t: "nb", runs: 2, bonus: 1, out: true, striker: 1 } },
    ]);
  });

  it("a wicket on a wide keeps the wide's runs and takes 5 (the board's WD-5)", () => {
    // Normal over: +1, still re-bowled, -5.
    const normal = summariseOver(0, false, [{ t: "wd", out: true, striker: 0 }, ...times(6, run(1))]);
    expect(normal).toMatchObject({ wides: 1, wickets: 1, legalBalls: 6, total: 1 - 5 + 6 });
    // Female over: +2, uses up the ball, -5.
    const female = summariseOver(0, true, [{ t: "wd", out: true, striker: 1 }, ...times(5, run(0))]);
    expect(female).toMatchObject({ wides: 1, wickets: 1, legalBalls: 6, complete: true, total: 2 - 5 });
    // It still counts toward the wide escalation (the 4th wide here: +2).
    expect(summariseOver(0, false, [wd, wd, wd, { t: "wd", out: true, striker: 0 }]).total).toBe(4 + 2 - 5);
  });

  it("match 24, Jesus Youth B's female over: WD WD (1+1) DB WD (WD-5) WD = 7, as on the board", () => {
    const card = replay({ battingFirst: 1 }, [
      ...start,
      { type: "female", on: true },
      ...balls([wd, wd, b(1, 1), db, wd, { t: "wd", out: true, striker: 1 }, wd]),
    ]);
    expect(card.innings[0].overs[0].total).toBe(7);
  });

  it("credits a wicket on a wide to whoever was out, without a ball faced", () => {
    const card = replay({ battingFirst: 1 }, [
      ...start,
      ...balls([{ t: "wd", out: true, striker: 0 }, a(1), { t: "wd", out: true, runOut: true, striker: 1, nonStriker: true }]),
    ]);
    const [anil, ben] = card.innings[0].batters;
    expect(anil).toMatchObject({ balls: 1, outs: 2, runs: 1 }); // stumped off the 1st wide, run out off the 2nd
    expect(ben).toMatchObject({ balls: 0, outs: 0 });
    expect(card.innings[0].unattributed).toBe(0);
    expect(card.innings[0].dismissals).toEqual([
      { over: 0, pair: 0, batter: "Anil", how: "stumped", runs: 0, bonus: 0, noBall: false, wide: true },
      { over: 0, pair: 0, batter: "Anil", how: "run out", runs: 0, bonus: 0, noBall: false, wide: true },
    ]);
    // A wicket on a wide doesn't change who's on strike.
    expect(defaultStriker(card.innings[0], 0).striker).toBe(1);
  });

  it("parseEvents keeps a wicket on a wide, and a plain wide stays plain", () => {
    expect(
      parseEvents([
        { type: "ball", ball: { t: "wd", out: true, striker: 0, runOut: true, nonStriker: true } },
        { type: "ball", ball: { t: "wd", out: true, striker: 1 } },
        { type: "ball", ball: { t: "wd", striker: 1, runOut: true } },
      ]),
    ).toEqual([
      { type: "ball", ball: { t: "wd", out: true, striker: 0, runOut: true, nonStriker: true } },
      { type: "ball", ball: { t: "wd", out: true, striker: 1 } },
      { type: "ball", ball: { t: "wd" } },
    ]);
    // Changing who bats first keeps the wicket (and its -5) but not who it was.
    const swapped = swapBattingFirst({ battingFirst: 1 }, [...start, ...balls([{ t: "wd", out: true, striker: 1 }])]);
    expect(swapped.events).toEqual(balls([{ t: "wd", out: true }]));
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
      { type: "ball", ball: { t: "nb", runs: 1, out: true, striker: 1, bonus: 1, nonStriker: true } },
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

describe("bowling figures", () => {
  const balls = (list: Ball[]): ScoreEvent[] => list.map((ball) => ({ type: "ball", ball }));
  const bat: ScoreEvent = { type: "batters", names: ["Anil", "Ben"] };
  const bowl = (name: string): ScoreEvent => ({ type: "bowler", name });
  const female: ScoreEvent = { type: "female", on: true };

  it("credits the over to its bowler: runs conceded, every wicket (run outs too), extras, side runs and boundaries", () => {
    const card = replay({ battingFirst: 1 }, [
      bat,
      bowl("Xavier"),
      ...balls([
        { t: "run", runs: 3, bonus: 2, striker: 0 }, // side 2 + 1 run
        wd,
        wd,
        wd,
        wd, // 4 wides: +4, and +2 for the 4th
        { t: "run", runs: 6, bonus: 6, striker: 1 },
        { t: "out", striker: 1 }, // caught
        { t: "out", runs: 1, striker: 0, runOut: true }, // run out after 1: still counts for the bowler
        { t: "nb", runs: 1, out: true, striker: 1 }, // no-ball run out
        { t: "run", runs: 4, bonus: 4, striker: 1 },
        db,
        { t: "run", runs: 0, striker: 1 },
      ]),
    ]);
    const inn = card.innings[0];
    expect(inn.bowlers).toEqual([
      { name: "Xavier", overs: 1, balls: 6, runs: 15 + 5 + 2, wickets: 3, wides: 4, noBalls: 1, deadBalls: 1, sideRuns: 2, fours: 1, sixes: 1, net: 7 },
    ]);
    // Every over has a bowler, so the bowlers' net adds up to the innings.
    expect(inn.bowlers.reduce((sum, b) => sum + b.net, 0)).toBe(inn.runs);
  });

  it("groups a bowler's overs by name, counts a wicket on a wide, and skips overs with no bowler", () => {
    const card = replay({ battingFirst: 1 }, [
      bat,
      bowl("Yusuf"),
      female,
      ...balls([wd, { t: "wd", out: true, striker: 0 }, ...times(4, run(1))]), // female over: wides +2 each and use a ball
      bowl("yusuf"),
      ...balls(times(6, run(2))),
      { type: "batters", names: ["Cara", "Dev"] },
      ...balls(times(6, run(1))), // nobody entered as bowler
    ]);
    const inn = card.innings[0];
    expect(inn.bowlers).toEqual([
      { name: "Yusuf", overs: 2, balls: 12, runs: 4 + 4 + 12, wickets: 1, wides: 2, noBalls: 0, deadBalls: 0, sideRuns: 0, fours: 0, sixes: 0, net: 3 + 12 },
    ]);
    expect(inn.runs).toBe(3 + 12 + 6);
  });

  it("puts each innings' bowlers on that innings (the fielding side)", () => {
    const sixes = (runs: number) => balls(times(6, run(runs)));
    const first = Array.from({ length: 6 }, (_, i) => [bowl(`B${i + 1}`), ...sixes(1)]).flat();
    const card = replay({ battingFirst: 2 }, [...first, bowl("Zed"), ...sixes(2)]);
    expect(card.innings[0].bowlers.map((b) => b.name)).toEqual(["B1", "B2", "B3", "B4", "B5", "B6"]);
    expect(card.innings[1].bowlers).toEqual([expect.objectContaining({ name: "Zed", runs: 12, net: 12 })]);
  });
});

describe("femaleOverPlayers", () => {
  const balls = (list: Ball[]): ScoreEvent[] => list.map((ball) => ({ type: "ball", ball }));
  const bowl = (name: string): ScoreEvent => ({ type: "bowler", name });
  const female: ScoreEvent = { type: "female", on: true };
  const faced = (striker: 0 | 1, n: number): Ball[] => times(n, { t: "run", runs: 1, striker });
  const inningsOf = (events: ScoreEvent[]) => replay({ battingFirst: 1 }, events).innings[0];

  it("names the female over's bowler and the batter who faced most of it, and nobody from normal overs", () => {
    const inn = inningsOf([
      { type: "batters", names: ["Priya", "Sam"] },
      bowl("Meera"),
      female,
      ...balls([wd, ...faced(0, 4), ...faced(1, 1)]), // the wide uses a ball; one ball to Sam: still Priya's over
      bowl("Tom"),
      ...balls(faced(1, 6)),
    ]);
    expect(inn.overs[0].balls).toHaveLength(6);
    expect(femaleOverPlayers(inn)).toEqual([{ bowler: "Meera", batter: "Priya" }]);
  });

  it("finds the female batter in either slot of the pair", () => {
    const inn = inningsOf([{ type: "batters", names: ["Sam", "Priya"] }, bowl("Tom"), ...balls(faced(0, 6)), bowl("Meera"), female, ...balls(faced(1, 6))]);
    expect(femaleOverPlayers(inn)).toEqual([{ bowler: "Meera", batter: "Priya" }]);
  });

  it("leaves out what wasn't recorded: no striker (before 17 Oct) or no bowler", () => {
    const inn = inningsOf([{ type: "batters", names: ["Priya", "Sam"] }, female, ...balls(times(6, run(1)))]);
    expect(femaleOverPlayers(inn)).toEqual([{ bowler: null, batter: null }]);
  });
});

describe("bowledAlready", () => {
  const bat: ScoreEvent = { type: "batters", names: ["Anil", "Ben"] };
  const bowl = (name: string): ScoreEvent => ({ type: "bowler", name });
  const six: ScoreEvent[] = times(6, run(1)).map((ball) => ({ type: "ball", ball }));
  const inningsOf = (events: ScoreEvent[]) => replay({ battingFirst: 1 }, events).innings[0];

  it("lists who bowled the finished overs when the next over is being set up", () => {
    const inn = inningsOf([bat, bowl("Xavier"), ...six, bowl("Yusuf"), ...six]);
    expect(inn.overs).toHaveLength(2);
    expect(bowledAlready(inn, 2)).toEqual([
      { name: "Xavier", over: 1 },
      { name: "Yusuf", over: 2 },
    ]);
  });

  it("leaves out the open over's own bowler, so that pick can still be corrected", () => {
    const inn = inningsOf([bat, bowl("Xavier"), ...six, bowl("Yusuf"), ...six.slice(0, 2)]);
    expect(bowledAlready(inn, 1)).toEqual([{ name: "Xavier", over: 1 }]);
  });

  it("counts a name once in any case, at its first over, and skips overs with no bowler", () => {
    const inn = inningsOf([bat, bowl("Yusuf"), ...six, bowl("yusuf"), ...six, { type: "batters", names: ["Cara", "Dev"] }, ...six]);
    expect(bowledAlready(inn, 3)).toEqual([{ name: "Yusuf", over: 1 }]);
  });

  it("starts empty: nobody has bowled before the first over, or in the other innings", () => {
    const first = Array.from({ length: 6 }, (_, i) => [bowl(`B${i + 1}`), ...six]).flat();
    const card = replay({ battingFirst: 1 }, [bat, ...first]);
    expect(bowledAlready(inningsOf([bat]), 0)).toEqual([]);
    expect(bowledAlready(card.innings[1], 0)).toEqual([]);
  });
});

describe("battedAlready", () => {
  const pair = (a: string, b: string): ScoreEvent => ({ type: "batters", names: [a, b] });
  const six: ScoreEvent[] = times(6, run(1)).map((ball) => ({ type: "ball", ball }));
  const inningsOf = (events: ScoreEvent[]) => replay({ battingFirst: 1 }, events).innings[0];
  const pairOne = [pair("Anil", "Ben"), ...six, ...six];

  it("lists the earlier pairs' batters when the next pair is being set up", () => {
    expect(battedAlready(inningsOf(pairOne), 1)).toEqual([
      { name: "Anil", pair: 1 },
      { name: "Ben", pair: 1 },
    ]);
    const twoPairs = inningsOf([...pairOne, pair("Cara", "Dev"), ...six, ...six]);
    expect(battedAlready(twoPairs, 2).map((b) => `${b.name} ${b.pair}`)).toEqual(["Anil 1", "Ben 1", "Cara 2", "Dev 2"]);
  });

  it("leaves out the current pair's own batters, so they can still be corrected", () => {
    const inn = inningsOf([...pairOne, pair("Cara", "Dev"), ...six.slice(0, 2)]);
    expect(battedAlready(inn, 1).map((b) => b.name)).toEqual(["Anil", "Ben"]);
    expect(battedAlready(inningsOf([pair("Anil", "Ben"), ...six]), 0)).toEqual([]);
  });

  it("counts a name once in any case, at its first pair, and starts empty in the other innings", () => {
    const inn = inningsOf([...pairOne, pair("ANIL", "Cara"), ...six, ...six]);
    expect(battedAlready(inn, 2)).toEqual([
      { name: "Anil", pair: 1 },
      { name: "Ben", pair: 1 },
      { name: "Cara", pair: 2 },
    ]);
    expect(battedAlready(replay({ battingFirst: 1 }, pairOne).innings[1], 0)).toEqual([]);
  });
});

describe("replaceBalls: correcting a ball that was already scored", () => {
  const setup = { battingFirst: 1 as const };
  const balls = (list: Ball[]): ScoreEvent[] => list.map((ball) => ({ type: "ball", ball }));
  const bowl = (name: string): ScoreEvent => ({ type: "bowler", name });
  const pair = (a: string, b: string): ScoreEvent => ({ type: "batters", names: [a, b] });
  const one: Ball = { t: "run", runs: 1, striker: 0 };
  const six = balls(times(6, one));
  const at = (innings: 0 | 1, over: number, ball: number) => ({ innings, over, ball });
  /** Three overs with names, the third still being bowled. */
  const threeOvers: ScoreEvent[] = [pair("Anil", "Ben"), bowl("Xavier"), ...six, bowl("Yusuf"), ...six, pair("Cara", "Dev"), bowl("Zed"), ...six.slice(0, 2)];
  const fixed = (events: ScoreEvent[], edits: Parameters<typeof replaceBalls>[2]) => {
    const result = replaceBalls(setup, events, edits);
    if (!result.ok) throw new Error(result.error);
    return result.events;
  };

  it("changes one ball in an earlier over; everything scored after it stays where it was", () => {
    const next = fixed(threeOvers, [{ at: at(0, 0, 2), ball: { t: "run", runs: 3, bonus: 2, striker: 1 } }]);
    expect(next).toHaveLength(threeOvers.length);
    expect(next.filter((e, i) => e !== threeOvers[i])).toEqual([{ type: "ball", ball: { t: "run", runs: 3, bonus: 2, striker: 1 } }]);
    const inn = replay(setup, next).innings[0];
    expect(inn.overs.map((o) => o.total)).toEqual([8, 6, 2]);
    expect(inn.overs.map((o) => o.bowler)).toEqual(["Xavier", "Yusuf", "Zed"]);
    expect(inn.pairs).toEqual([["Anil", "Ben"], ["Cara", "Dev"], null]);
    expect(inn.batters.find((b) => b.name === "Ben")).toMatchObject({ runs: 3, balls: 1, sideRuns: 2 });
    // Undo still takes off the last ball, not the correction.
    expect(replay(setup, next.slice(0, -1)).innings[0].overs.map((o) => o.total)).toEqual([8, 6, 1]);
  });

  it("a run that was really a wicket: -5 and no run, in an over long finished", () => {
    const next = fixed(threeOvers, [{ at: at(0, 1, 5), ball: { t: "out", striker: 0 } }]);
    const inn = replay(setup, next).innings[0];
    expect(inn.overs[1]).toMatchObject({ total: 0, wickets: 1, legalBalls: 6, complete: true });
    expect(inn.bowlers.find((b) => b.name === "Yusuf")).toMatchObject({ wickets: 1, runs: 5 });
    expect(inn.dismissals).toEqual([expect.objectContaining({ over: 1, batter: "Anil", how: "out" })]);
  });

  it("a first-innings correction made during the chase moves the target", () => {
    const first = Array.from({ length: 6 }, () => six).flat();
    const events = [...first, ...six];
    expect(replay(setup, events).target).toBe(37);
    const card = replay(setup, fixed(events, [{ at: at(0, 3, 0), ball: { t: "run", runs: 6, bonus: 6, striker: 0 } }]));
    expect(card.target).toBe(42);
    expect(card.innings[1].runs).toBe(6);
    expect(card.current).toBe(1);
  });

  it("refuses a change that would move later balls into another over, and changes nothing", () => {
    // Over 1 with a wide in it would need a seventh ball: the first ball of over 2 would slide back.
    expect(replaceBalls(setup, threeOvers, [{ at: at(0, 0, 2), ball: { t: "wd" } }])).toEqual({ ok: false, error: EDIT_MOVES_BALLS });
    // The other way: a wide that was really a run ends the over a ball sooner, so its last ball spills forward.
    const withWide = [bowl("Xavier"), ...balls([wd, ...times(6, one)]), bowl("Yusuf"), ...six];
    expect(replaceBalls(setup, withWide, [{ at: at(0, 0, 0), ball: one }])).toEqual({ ok: false, error: EDIT_MOVES_BALLS });
    // Kinds that are re-bowled alike can swap freely.
    expect(replay(setup, fixed(withWide, [{ at: at(0, 0, 0), ball: { t: "nb", runs: 2, striker: 0 } }])).innings[0].overs[0].total).toBe(9);
    expect(replay(setup, fixed(withWide, [{ at: at(0, 0, 0), ball: { t: "db" } }])).innings[0].overs[0].total).toBe(6);
  });

  it("the next over's bowler, picked before its first ball, stays with that over", () => {
    const events = [bowl("Xavier"), ...six, bowl("Yusuf")];
    const next = fixed(events, [{ at: at(0, 0, 5), ball: { t: "run", runs: 2, striker: 0 } }]);
    expect(replay(setup, next).innings[0].overs.map((o) => o.bowler)).toEqual(["Xavier", "Yusuf"]);
    // Reopening over 1 would hand it to Yusuf.
    expect(replaceBalls(setup, events, [{ at: at(0, 0, 5), ball: { t: "wd" } }])).toEqual({ ok: false, error: EDIT_MOVES_BALLS });
  });

  it("in the over still being bowled, any change goes: nothing comes after it", () => {
    const open = [bowl("Xavier"), ...six.slice(0, 4)];
    const wider = replay(setup, fixed(open, [{ at: at(0, 0, 1), ball: { t: "wd" } }])).innings[0].overs[0];
    expect(wider).toMatchObject({ legalBalls: 3, wides: 1, total: 4, complete: false });
    // The last ball of a just-finished over can be reopened too, and closed again.
    const reopened = fixed([bowl("Xavier"), ...six], [{ at: at(0, 0, 5), ball: { t: "db" } }]);
    expect(replay(setup, reopened).innings[0].overs[0].complete).toBe(false);
    expect(replay(setup, fixed(reopened, [{ at: at(0, 0, 5), ball: one }])).innings[0].overs[0].complete).toBe(true);
  });

  it("a female-over wide uses up a ball, so there it swaps with a run", () => {
    const events: ScoreEvent[] = [bowl("Meera"), { type: "female", on: true }, ...six, bowl("Tom"), ...six];
    const inn = replay(setup, fixed(events, [{ at: at(0, 0, 3), ball: { t: "wd" } }])).innings[0];
    expect(inn.overs[0]).toMatchObject({ female: true, total: 7, legalBalls: 6, complete: true });
    expect(inn.overs[1].balls).toHaveLength(6);
  });

  it("the last ball of the match can be corrected: the result follows, or play goes on", () => {
    const innings = (ball: Ball) => Array.from({ length: 6 }, () => balls(times(6, ball))).flat();
    const tie = [...innings(one), ...innings(one)];
    expect(replay(setup, tie).result).toEqual({ winner: null, margin: 0 });
    expect(replay(setup, fixed(tie, [{ at: at(1, 5, 5), ball: { t: "run", runs: 2, striker: 0 } }])).result).toEqual({ winner: 2, margin: 1 });
    const again = replay(setup, fixed(tie, [{ at: at(1, 5, 5), ball: { t: "nb", runs: 0, striker: 0 } }]));
    expect(again.finished).toBe(false);
    expect(again.innings[1].overs[5]).toMatchObject({ legalBalls: 5, complete: false });
  });

  it("takes several corrections together, and none of them if one can't be made", () => {
    const next = fixed(threeOvers, [
      { at: at(0, 0, 0), ball: facedBy(one, 1) },
      { at: at(0, 0, 1), ball: facedBy(one, 1) },
    ]);
    expect(replay(setup, next).innings[0].batters.map((b) => `${b.name} ${b.balls}`)).toEqual(["Anil 10", "Ben 2", "Cara 2", "Dev 0"]);
    const bad = replaceBalls(setup, threeOvers, [
      { at: at(0, 0, 0), ball: facedBy(one, 1) },
      { at: at(0, 0, 1), ball: wd },
    ]);
    expect(bad.ok).toBe(false);
  });

  it("refuses a ball that isn't on the card, or isn't a ball; tidies one that's nearly right", () => {
    expect(replaceBalls(setup, threeOvers, [{ at: at(0, 2, 2), ball: one }]).ok).toBe(false); // not bowled yet
    expect(replaceBalls(setup, threeOvers, [{ at: at(1, 0, 0), ball: one }]).ok).toBe(false);
    expect(replaceBalls(setup, threeOvers, [{ at: at(0, 0, 0), ball: { t: "run", runs: -1 } }]).ok).toBe(false);
    // Side runs can't be more than the ball's runs: dropped, as when a phone saves.
    const next = fixed(threeOvers, [{ at: at(0, 0, 0), ball: { t: "run", runs: 1, bonus: 3, striker: 0 } }]);
    expect(next.find((e) => e.type === "ball")).toEqual({ type: "ball", ball: { t: "run", runs: 1, striker: 0 } });
  });
});

describe("correctBall: one ball, as the scorer's sheet changes it", () => {
  const setup = { battingFirst: 1 as const };
  const balls = (list: Ball[]): ScoreEvent[] => list.map((ball) => ({ type: "ball", ball }));
  const faced = (striker: 0 | 1, runs = 1): Ball => ({ t: "run", runs, striker });
  const names: ScoreEvent = { type: "batters", names: ["Priya", "Sam"] };
  const at = (over: number, ball: number) => ({ innings: 0 as const, over, ball });
  const fixed = (events: ScoreEvent[], where: ReturnType<typeof at>, ball: Ball) => {
    const result = correctBall(setup, events, where, ball);
    if (!result.ok) throw new Error(result.error);
    return replay(setup, result.events).innings[0];
  };

  it("female over scored to the wrong batter: changing one ball's striker moves the whole over", () => {
    // Sam was tapped by mistake; Priya is the female batter. A wide and a dead ball have no striker.
    const over = [faced(1), wd, faced(1, 2), db, { t: "out", runOut: true, runs: 1, striker: 1 } as Ball, faced(1), faced(1)];
    const events: ScoreEvent[] = [names, { type: "bowler", name: "Meera" }, { type: "female", on: true }, ...balls(over), { type: "bowler", name: "Tom" }, ...balls(times(6, faced(1)))];
    expect(femaleOverPlayers(replay(setup, events).innings[0])).toEqual([{ bowler: "Meera", batter: "Sam" }]);

    const inn = fixed(events, at(0, 0), faced(0));
    expect(femaleOverPlayers(inn)).toEqual([{ bowler: "Meera", batter: "Priya" }]);
    expect(inn.overs[0].balls.map((b) => ("striker" in b ? b.striker : "-"))).toEqual([0, "-", 0, "-", 0, 0, 0]);
    // Sam was the one run out, and still is: now at the other end.
    expect(inn.overs[0].balls[4]).toEqual({ t: "out", runOut: true, runs: 1, striker: 0, nonStriker: true });
    expect(inn.dismissals).toEqual([expect.objectContaining({ batter: "Sam", how: "run out" })]);
    // The partner's over is left alone, and so is the score.
    expect(inn.overs[1].balls.every((b) => b.t === "run" && b.striker === 1)).toBe(true);
    expect(inn.runs).toBe(replay(setup, events).innings[0].runs);
  });

  it("in a normal over only the ball itself changes", () => {
    const events: ScoreEvent[] = [names, ...balls(times(6, faced(0)))];
    const inn = fixed(events, at(0, 2), faced(1, 3));
    expect(inn.overs[0].balls.map((b) => (b.t === "run" ? b.striker : "-"))).toEqual([0, 0, 1, 0, 0, 0]);
    expect(inn.batters.map((b) => `${b.name} ${b.runs} (${b.balls})`)).toEqual(["Priya 5 (5)", "Sam 3 (1)"]);
  });

  it("a female-over change with no striker in it (a wide, a dead ball) touches nothing else", () => {
    const events: ScoreEvent[] = [names, { type: "female", on: true }, ...balls(times(6, faced(0)))];
    expect(fixed(events, at(0, 5), wd).overs[0].balls.slice(0, 5)).toEqual(times(5, faced(0)));
  });
});

describe("facedBy / isWicket / isRunOut", () => {
  it("moves a ball off the bat to the other batter; wides and dead balls have nobody on strike", () => {
    expect(facedBy({ t: "run", runs: 3, bonus: 2, striker: 0 }, 1)).toEqual({ t: "run", runs: 3, bonus: 2, striker: 1 });
    expect(facedBy({ t: "nb", runs: 1, striker: 1 }, 0)).toEqual({ t: "nb", runs: 1, striker: 0 });
    expect(facedBy(wd, 1)).toEqual({ t: "wd" });
    expect(facedBy(db, 1)).toEqual({ t: "db" });
  });

  it("a catch or a stumping goes with the striker; a run out keeps whoever was out", () => {
    expect(facedBy({ t: "out", striker: 0 }, 1)).toEqual({ t: "out", striker: 1 });
    expect(facedBy({ t: "wd", out: true, striker: 0 }, 1)).toEqual({ t: "wd", out: true, striker: 1 });
    // Batter 0 was run out while facing: with batter 1 facing, batter 0 is out at the other end.
    expect(facedBy({ t: "out", runOut: true, runs: 1, striker: 0 }, 1)).toEqual({ t: "out", runOut: true, runs: 1, striker: 1, nonStriker: true });
    // Batter 1 was run out at the other end: now they faced it, and are still the one out.
    expect(facedBy({ t: "nb", runs: 2, out: true, striker: 0, nonStriker: true }, 1)).toEqual({ t: "nb", runs: 2, out: true, striker: 1 });
    expect(facedBy({ t: "wd", out: true, runOut: true, striker: 1 }, 0)).toEqual({ t: "wd", out: true, runOut: true, striker: 0, nonStriker: true });
  });

  it("tells wickets from other balls, and run outs from other wickets", () => {
    const wickets: Ball[] = [out, { t: "out", runOut: true }, { t: "out", runs: 2 }, { t: "nb", runs: 0, out: true }, { t: "wd", out: true }, { t: "wd", out: true, runOut: true }];
    expect(wickets.map(isWicket)).toEqual([true, true, true, true, true, true]);
    expect([run(1), nb(2), wd, db].map(isWicket)).toEqual([false, false, false, false]);
    expect(wickets.map(isRunOut)).toEqual([false, true, true, true, false, true]);
  });
});
