import { describe, expect, it } from "vitest";
import seed from "../../prisma/seed-data.json";
import {
  computeStandings,
  formatNrr,
  resolveKnockouts,
  slotLabel,
  type MatchLite,
  type MatchStatus,
  type Stage,
  type TeamLite,
} from "./tournament";

const teams: TeamLite[] = seed.teams.map((t, i) => ({ id: i + 1, ...t }));
const idOf = (name: string | null) => (name ? teams.find((t) => t.name === name)!.id : null);
const seedMatches: MatchLite[] = seed.matches.map((m) => ({
  matchNo: m.matchNo,
  stage: m.stage as Stage,
  group: m.group,
  team1Id: idOf(m.team1),
  team2Id: idOf(m.team2),
  slot1: m.slot1,
  slot2: m.slot2,
  score1: m.score1,
  score2: m.score2,
  status: m.status as MatchStatus,
  winnerId: null,
}));

// Organisers' "Day 3 - Group Standings" PDF (6 Oct 2026):
// [team, P, W, L, D, RS, RA, RR, NRR, Points]
// Exception: their sheet shows ROYAL STRIKERS on 0 points despite a win. Correct is 2.
const DAY3: Record<string, [string, number, number, number, number, number, number, number, number | null, number][]> = {
  A: [
    ["DREAM XI MANGALORE", 2, 2, 0, 0, 162, 48, 114, 57, 4],
    ["ST. PAULS", 2, 2, 0, 0, 134, 95, 39, 19.5, 4],
    ["JESUS YOUTH", 2, 2, 0, 0, 151, 131, 20, 10, 4],
    ["GOLIBAJE DIVIDED", 2, 0, 2, 0, 72, 117, -45, -22.5, 0],
    ["JESUS YOUTH C", 2, 0, 2, 0, 89, 139, -50, -25, 0],
    ["ROYAL TUSKERS", 2, 0, 2, 0, 113, 191, -78, -39, 0],
  ],
  B: [
    ["FAITH RIDERS", 2, 2, 0, 0, 201, 139, 62, 31, 4],
    ["SRI LANKAN COMMUNITY B", 1, 1, 0, 0, 87, 17, 70, 70, 2],
    ["GOLIBAJE UNITED", 2, 1, 1, 0, 141, 191, -50, -25, 2],
    ["LOS CATHEDRALS", 1, 0, 1, 0, 76, 80, -4, -4, 0],
    ["GAME CHANGERS", 2, 0, 2, 0, 87, 165, -78, -39, 0],
  ],
  C: [
    ["SUNSHINE APOSTLES", 1, 1, 0, 0, 108, 28, 80, 80, 2],
    ["SUNSHINE DISCIPLES", 1, 1, 0, 0, 106, 63, 43, 43, 2],
    ["AVCC", 1, 0, 1, 0, 63, 106, -43, -43, 0],
    ["JESUS YOUTH B", 1, 0, 1, 0, 28, 108, -80, -80, 0],
    ["TAMIL STRIKERS C", 0, 0, 0, 0, 0, 0, 0, null, 0],
  ],
  D: [
    ["ROYAL STRIKERS", 1, 1, 0, 0, 68, 47, 21, 21, 2],
    ["TAMIL STRIKERS", 1, 0, 1, 0, 47, 68, -21, -21, 0],
    ["EAGLES ABU DHABI", 0, 0, 0, 0, 0, 0, 0, null, 0],
    ["SRI LANKAN COMMUNITY A", 0, 0, 0, 0, 0, 0, 0, null, 0],
    ["G. U. M. CC", 0, 0, 0, 0, 0, 0, 0, null, 0],
  ],
};

describe("computeStandings", () => {
  const standings = computeStandings(teams, seedMatches);

  for (const group of Object.keys(DAY3)) {
    it(`reproduces the organisers' Day 3 table for Group ${group}`, () => {
      const actual = standings[group].map((r) => [
        r.team.name,
        r.played,
        r.won,
        r.lost,
        r.drawn,
        r.runsFor,
        r.runsAgainst,
        r.runDiff,
        r.nrr,
        r.points,
      ]);
      expect(actual).toEqual(DAY3[group]);
    });
  }

  const base = (overrides: Partial<MatchLite>): MatchLite => ({
    matchNo: 99,
    stage: "GROUP",
    group: "D",
    team1Id: idOf("EAGLES ABU DHABI"),
    team2Id: idOf("G. U. M. CC"),
    slot1: null,
    slot2: null,
    score1: null,
    score2: null,
    status: "SCHEDULED",
    winnerId: null,
    ...overrides,
  });
  const rowFor = (matches: MatchLite[], name: string) =>
    computeStandings(teams, matches).D.find((r) => r.team.name === name)!;

  it("scores a tie as a draw worth 1 point each", () => {
    const tie = [base({ status: "COMPLETED", score1: 50, score2: 50 })];
    expect(rowFor(tie, "EAGLES ABU DHABI")).toMatchObject({ drawn: 1, points: 1, nrr: 0 });
    expect(rowFor(tie, "G. U. M. CC")).toMatchObject({ drawn: 1, points: 1 });
  });

  it("gives a walkover 2 points without touching runs", () => {
    const wo = [base({ status: "WALKOVER", winnerId: idOf("G. U. M. CC") })];
    expect(rowFor(wo, "G. U. M. CC")).toMatchObject({ played: 1, won: 1, points: 2, runsFor: 0, nrr: null });
    expect(rowFor(wo, "EAGLES ABU DHABI")).toMatchObject({ played: 1, lost: 1, points: 0 });
  });

  it("gives an abandoned match 1 point each and a double forfeit 0", () => {
    expect(rowFor([base({ status: "ABANDONED" })], "EAGLES ABU DHABI")).toMatchObject({ noResult: 1, points: 1 });
    expect(rowFor([base({ status: "DOUBLE_FORFEIT" })], "EAGLES ABU DHABI")).toMatchObject({ lost: 1, points: 0 });
  });

  it("ignores scheduled and postponed matches", () => {
    expect(rowFor([base({ status: "POSTPONED", score1: 10, score2: 5 })], "EAGLES ABU DHABI").played).toBe(0);
  });
});

describe("resolveKnockouts", () => {
  it("leaves quarter-finals open while groups are unfinished", () => {
    const qf1 = resolveKnockouts(teams, seedMatches).find((m) => m.matchNo === 46)!;
    expect(qf1.home).toBeNull();
    expect(qf1.away).toBeNull();
  });

  it("fills the bracket once groups finish and carries winners and losers forward", () => {
    // Every remaining group match: team 1 wins 100-50.
    const done = seedMatches.map((m) =>
      m.stage === "GROUP" && m.status !== "COMPLETED" ? { ...m, status: "COMPLETED" as const, score1: 100, score2: 50 } : m,
    );
    const standings = computeStandings(teams, done);
    const pos = (g: string, i: number) => standings[g][i].team.id;

    const withQfs = done.map((m) => (m.stage === "QF" ? { ...m, status: "COMPLETED" as const, score1: 80, score2: 70 } : m));
    const resolved = resolveKnockouts(teams, withQfs);
    const byNo = (n: number) => resolved.find((m) => m.matchNo === n)!;

    expect([byNo(46).home, byNo(46).away]).toEqual([pos("A", 0), pos("B", 1)]);
    expect([byNo(49).home, byNo(49).away]).toEqual([pos("D", 0), pos("C", 1)]);
    // QF home sides won, so SF1 = winner QF1 v winner QF2.
    expect([byNo(50).home, byNo(50).away]).toEqual([pos("A", 0), pos("C", 0)]);

    // A knockout tie needs a super-over winner before it resolves.
    const tiedSf = withQfs.map((m) => (m.matchNo === 50 ? { ...m, status: "COMPLETED" as const, score1: 60, score2: 60 } : m));
    expect(resolveKnockouts(teams, tiedSf).find((m) => m.matchNo === 53)!.home).toBeNull();
    const superOver = tiedSf.map((m) => (m.matchNo === 50 ? { ...m, winnerId: pos("C", 0) } : m));
    const after = resolveKnockouts(teams, superOver);
    expect(after.find((m) => m.matchNo === 53)!.home).toBe(pos("C", 0));
    expect(after.find((m) => m.matchNo === 52)!.home).toBe(pos("A", 0));
  });
});

describe("labels", () => {
  it("formats NRR and slot names", () => {
    expect(formatNrr(19.5)).toBe("+19.5");
    expect(formatNrr(-22.5)).toBe("-22.5");
    expect(formatNrr(1 / 3)).toBe("+0.33");
    expect(formatNrr(null)).toBe("–");
    expect(slotLabel("A1")).toBe("Group A winner");
    expect(slotLabel("B2")).toBe("Group B runner-up");
    expect(slotLabel("W46")).toBe("Winner QF1");
    expect(slotLabel("L50")).toBe("Loser SF1");
  });
});
