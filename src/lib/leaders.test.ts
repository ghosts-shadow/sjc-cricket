import { describe, expect, it } from "vitest";
import {
  battingAverage,
  battingStrikeRate,
  bowlingAverage,
  bowlingStrikeRate,
  economy,
  mvpEconomy,
  mvpScore,
  playerKey,
  rankBy,
  tally,
  type Column,
  type PlayedCard,
} from "./leaders";
import { replay, type Ball, type ScoreEvent } from "./scoring";

const teams = { 1: { id: 1, name: "Alpha" }, 2: { id: 2, name: "Beta" } };
const balls = (list: Ball[]): ScoreEvent[] => list.map((ball) => ({ type: "ball", ball }));
const bat = (a: string, b: string): ScoreEvent => ({ type: "batters", names: [a, b] });
const bowl = (name: string): ScoreEvent => ({ type: "bowler", name });
const repeat = (n: number, ball: Ball): Ball[] => Array.from({ length: n }, () => ball);
const end: ScoreEvent = { type: "endInnings" };

// Match 1. Alpha: Anil 11 off 3 (a four and a six), Ben 2 off 3 and out once. Xavier bowls it: 13 off the
// bat + 1 wide = 14 given, 1 wicket, 1 extra. Beta: Xavier 6 off 6, Yara faces nothing. Anil gives 6.
const first: PlayedCard = {
  teams,
  card: replay({ battingFirst: 1 }, [
    bat("Anil", "Ben"),
    bowl("Xavier"),
    ...balls([
      { t: "run", runs: 4, bonus: 4, striker: 0 },
      { t: "run", runs: 6, bonus: 6, striker: 0 },
      { t: "wd" },
      { t: "run", runs: 1, striker: 0 },
      { t: "out", striker: 1 },
      { t: "run", runs: 0, striker: 1 },
      { t: "run", runs: 2, striker: 1 },
    ]),
    end,
    bat("Xavier", "Yara"),
    bowl("Anil"),
    ...balls(repeat(6, { t: "run", runs: 1, striker: 0 })),
  ]),
};
// Match 2. Alpha only: "anil" (another spelling) 12 off 6 with Cara at the other end. Yara gives 12.
const second: PlayedCard = {
  teams,
  card: replay({ battingFirst: 1 }, [bat("anil", "Cara"), bowl("Yara"), ...balls(repeat(6, { t: "run", runs: 2, striker: 0 }))]),
};
const result = tally([first, second], new Set([playerKey(2, "YARA")]));
const named = <T extends { name: string }>(rows: T[], name: string) => rows.find((r) => r.name === name)!;

describe("tally", () => {
  it("adds up each batter across matches, matching names in any case", () => {
    expect(named(result.batting, "Anil")).toMatchObject({ team: "Alpha", innings: 2, runs: 23, balls: 9, fours: 1, sixes: 1, outs: 0, net: 23 });
    expect(named(result.batting, "Ben")).toMatchObject({ innings: 1, runs: 2, balls: 3, outs: 1, net: -3 });
    expect(result.batting.map((r) => r.name).sort()).toEqual(["Anil", "Ben", "Cara", "Xavier", "Yara"]);
  });

  it("counts a batter who was named in a pair but faced nothing", () => {
    expect(named(result.batting, "Yara")).toMatchObject({ innings: 1, runs: 0, balls: 0 });
  });

  it("adds up each bowler: runs given include the wide, and extras are counted", () => {
    expect(named(result.bowling, "Xavier")).toMatchObject({ team: "Beta", overs: 1, balls: 6, runs: 14, wickets: 1, wides: 1, net: 9 });
    expect(named(result.bowling, "Anil")).toMatchObject({ team: "Alpha", overs: 1, runs: 6, wickets: 0 });
    expect(result.bowling.map((r) => r.name).sort()).toEqual(["Anil", "Xavier", "Yara"]);
  });

  it("counts a match once for a player who batted and bowled in it, and marks the female players", () => {
    expect(result.matches).toBe(2);
    expect(named(result.mvp, "Anil")).toMatchObject({ matches: 2, female: false });
    expect(named(result.mvp, "Yara")).toMatchObject({ matches: 2, female: true });
    expect(named(result.mvp, "Xavier").matches).toBe(1);
  });

  it("works out the MVP score from batting and bowling together", () => {
    expect(named(result.mvp, "Anil")).toMatchObject({ runs: 23, given: 6, outs: 0, wickets: 0, extras: 0, mvp: 8.5 }); // (23 - 6) / 2
    expect(named(result.mvp, "Ben")).toMatchObject({ runs: 2, outs: 1, mvp: -3 }); // 2 - 5
    expect(named(result.mvp, "Xavier")).toMatchObject({ runs: 6, given: 14, wickets: 1, extras: 1, mvp: -4 }); // 6 - 14 + 5 - 1
    expect(named(result.mvp, "Yara")).toMatchObject({ runs: 0, given: 12, mvp: -6 }); // -12 / 2
    expect(named(result.mvp, "Cara")).toMatchObject({ matches: 1, mvp: 0 });
  });

  it("carries the overs bowled for the MVP table's economy, which the score doesn't use", () => {
    expect(named(result.mvp, "Xavier")).toMatchObject({ overs: 1, given: 14 });
    expect(mvpEconomy(named(result.mvp, "Xavier"))).toBe(14);
    expect(mvpEconomy(named(result.mvp, "Anil"))).toBe(6);
    expect(mvpEconomy(named(result.mvp, "Ben"))).toBeNull(); // never bowled
    expect(mvpEconomy({ given: 21, overs: 2 })).toBe(economy({ runs: 21, overs: 2 }));
    // Same score with or without the overs: economy is display only.
    const anil = named(result.mvp, "Anil");
    const moreOvers = { ...anil, overs: 99 };
    expect(mvpScore(moreOvers)).toBe(anil.mvp);
  });
});

describe("mvpScore", () => {
  it("is (runs - given + 5 x wickets - 5 x outs - extras) / matches", () => {
    expect(mvpScore({ runs: 60, given: 30, wickets: 4, outs: 2, extras: 3, matches: 5 })).toBe((60 - 30 + 20 - 10 - 3) / 5);
    expect(mvpScore({ runs: 0, given: 0, wickets: 0, outs: 0, extras: 0, matches: 0 })).toBe(0);
  });
});

describe("rates", () => {
  it("batting: average is runs per out (never out keeps the runs), strike rate is per 100 balls", () => {
    expect(battingAverage({ runs: 30, outs: 2 })).toBe(15);
    expect(battingAverage({ runs: 30, outs: 0 })).toBe(30);
    expect(battingStrikeRate({ runs: 9, balls: 6 })).toBe(150);
    expect(battingStrikeRate({ runs: 0, balls: 0 })).toBe(0);
  });

  it("bowling: economy per over, average and strike rate per wicket, nothing without a wicket", () => {
    expect(economy({ runs: 21, overs: 2 })).toBe(10.5);
    expect(bowlingAverage({ runs: 21, wickets: 3 })).toBe(7);
    expect(bowlingStrikeRate({ balls: 12, wickets: 3 })).toBe(4);
    expect(bowlingAverage({ runs: 21, wickets: 0 })).toBeNull();
    expect(bowlingStrikeRate({ balls: 12, wickets: 0 })).toBeNull();
  });
});

describe("rankBy", () => {
  type Row = { name: string; runs: number; overs: number; econ: number | null };
  const rows: Row[] = [
    { name: "Dev", runs: 10, overs: 3, econ: 8 },
    { name: "Asha", runs: 30, overs: 1, econ: 2 },
    { name: "Bala", runs: 30, overs: 2, econ: 6 },
    { name: "Chris", runs: 5, overs: 4, econ: null },
  ];
  const byRuns: Column<Row> = { key: "runs", head: "R", title: "Runs", value: (r) => r.runs };
  const byEcon: Column<Row> = { key: "econ", head: "Econ", title: "Economy", value: (r) => r.econ, best: "asc", qualifies: (r) => r.overs >= 2 };
  const none = () => 0;

  it("puts the biggest first, breaks ties with the tiebreak and then the name, and numbers from 1", () => {
    expect(rankBy(rows, byRuns, none).map((r) => `${r.rank} ${r.name}`)).toEqual(["1 Asha", "2 Bala", "3 Dev", "4 Chris"]);
    expect(rankBy(rows, byRuns, (a, b) => b.overs - a.overs).map((r) => r.name)).toEqual(["Bala", "Asha", "Dev", "Chris"]);
  });

  it("puts the smallest first when smaller is better, with unqualified and empty rows last and unranked", () => {
    expect(rankBy(rows, byEcon, none).map((r) => `${r.rank} ${r.name}`)).toEqual(["1 Bala", "2 Dev", "0 Asha", "0 Chris"]);
  });

  it("leaves the rows it was given untouched", () => {
    const before = rows.map((r) => r.name);
    rankBy(rows, byEcon, none);
    expect(rows.map((r) => r.name)).toEqual(before);
  });
});
