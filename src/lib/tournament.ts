/**
 * Pure tournament logic: standings and knockout bracket resolution.
 * No database or framework imports, so it can be unit-tested directly.
 */

export type MatchStatus =
  | "SCHEDULED"
  | "COMPLETED"
  | "WALKOVER"
  | "ABANDONED"
  | "DOUBLE_FORFEIT"
  | "POSTPONED";

export type Stage = "GROUP" | "QF" | "SF" | "THIRD" | "FINAL";

export interface TeamLite {
  id: number;
  name: string;
  slug: string;
  group: string;
  drawPos: number;
}

export interface MatchLite {
  matchNo: number;
  stage: Stage;
  group: string | null;
  team1Id: number | null;
  team2Id: number | null;
  slot1: string | null;
  slot2: string | null;
  score1: number | null;
  score2: number | null;
  status: MatchStatus;
  winnerId: number | null;
}

export interface StandingRow {
  team: TeamLite;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  noResult: number;
  runsFor: number;
  runsAgainst: number;
  runDiff: number;
  /** Organisers' "NRR": run difference per match with a scored result. Null if none yet. */
  nrr: number | null;
  points: number;
}

export const GROUPS = ["A", "B", "C", "D"] as const;
export const QUALIFIERS_PER_GROUP = 2;

const FINISHED: MatchStatus[] = ["COMPLETED", "WALKOVER", "ABANDONED", "DOUBLE_FORFEIT"];

export function isFinished(match: Pick<MatchLite, "status">): boolean {
  return FINISHED.includes(match.status);
}

/**
 * Points per the SJC rules: win 2, draw 1, loss 0. Walkover: present team wins (2).
 * Abandoned (weather): 1 each. Both teams short: 0 each.
 * Runs only count from matches actually played out (COMPLETED).
 */
export function computeStandings(teams: TeamLite[], matches: MatchLite[]): Record<string, StandingRow[]> {
  const rows = new Map<number, StandingRow & { scoredMatches: number }>();
  for (const team of teams) {
    rows.set(team.id, {
      team,
      played: 0,
      won: 0,
      lost: 0,
      drawn: 0,
      noResult: 0,
      runsFor: 0,
      runsAgainst: 0,
      runDiff: 0,
      nrr: null,
      points: 0,
      scoredMatches: 0,
    });
  }

  for (const m of matches) {
    if (m.stage !== "GROUP" || m.team1Id == null || m.team2Id == null) continue;
    const a = rows.get(m.team1Id);
    const b = rows.get(m.team2Id);
    if (!a || !b) continue;

    switch (m.status) {
      case "COMPLETED": {
        if (m.score1 == null || m.score2 == null) break;
        a.played++;
        b.played++;
        a.scoredMatches++;
        b.scoredMatches++;
        a.runsFor += m.score1;
        a.runsAgainst += m.score2;
        b.runsFor += m.score2;
        b.runsAgainst += m.score1;
        if (m.score1 === m.score2) {
          a.drawn++;
          b.drawn++;
          a.points += 1;
          b.points += 1;
        } else {
          const [winner, loser] = m.score1 > m.score2 ? [a, b] : [b, a];
          winner.won++;
          winner.points += 2;
          loser.lost++;
        }
        break;
      }
      case "WALKOVER": {
        if (m.winnerId == null) break;
        const [winner, loser] = m.winnerId === m.team1Id ? [a, b] : [b, a];
        a.played++;
        b.played++;
        winner.won++;
        winner.points += 2;
        loser.lost++;
        break;
      }
      case "ABANDONED":
        a.played++;
        b.played++;
        a.noResult++;
        b.noResult++;
        a.points += 1;
        b.points += 1;
        break;
      case "DOUBLE_FORFEIT":
        a.played++;
        b.played++;
        a.lost++;
        b.lost++;
        break;
    }
  }

  const byGroup: Record<string, StandingRow[]> = {};
  for (const group of GROUPS) byGroup[group] = [];
  for (const { scoredMatches, ...row } of rows.values()) {
    row.runDiff = row.runsFor - row.runsAgainst;
    row.nrr = scoredMatches > 0 ? row.runDiff / scoredMatches : null;
    (byGroup[row.team.group] ??= []).push(row);
  }
  for (const group of Object.keys(byGroup)) byGroup[group].sort(compareRows);
  return byGroup;
}

function compareRows(x: StandingRow, y: StandingRow): number {
  if (y.points !== x.points) return y.points - x.points;
  // Teams without a scored match rank below teams with one (organisers' sheet does the same).
  if ((x.nrr == null) !== (y.nrr == null)) return x.nrr == null ? 1 : -1;
  if (x.nrr != null && y.nrr != null && y.nrr !== x.nrr) return y.nrr - x.nrr;
  if (y.runsFor !== x.runsFor) return y.runsFor - x.runsFor;
  return x.team.drawPos - y.team.drawPos;
}

export function formatNrr(nrr: number | null): string {
  if (nrr == null) return "–";
  const rounded = Math.round(nrr * 100) / 100;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

// ---------------------------------------------------------------------------
// Knockouts
// ---------------------------------------------------------------------------

export const KNOCKOUT_NAMES: Record<number, string> = {
  46: "QF1",
  47: "QF2",
  48: "QF3",
  49: "QF4",
  50: "SF1",
  51: "SF2",
  52: "3rd place",
  53: "Final",
};

export function matchLabel(match: Pick<MatchLite, "matchNo" | "stage" | "group">): string {
  if (match.stage === "GROUP") return `Group ${match.group} · Match ${match.matchNo}`;
  return KNOCKOUT_NAMES[match.matchNo] ?? `Match ${match.matchNo}`;
}

export function slotLabel(slot: string): string {
  const group = slot.match(/^([A-D])([12])$/);
  if (group) return `Group ${group[1]} ${group[2] === "1" ? "winner" : "runner-up"}`;
  const ko = slot.match(/^([WL])(\d+)$/);
  if (ko) return `${ko[1] === "W" ? "Winner" : "Loser"} ${KNOCKOUT_NAMES[Number(ko[2])] ?? `match ${ko[2]}`}`;
  return slot;
}

/** Winner of a finished match, or null if undecided (a knockout tie needs the super-over winner). */
export function matchWinnerId(m: MatchLite): number | null {
  if (m.winnerId != null) return m.winnerId;
  if (m.status !== "COMPLETED" || m.score1 == null || m.score2 == null || m.score1 === m.score2) return null;
  return m.score1 > m.score2 ? m.team1Id : m.team2Id;
}

export interface ResolvedMatch extends MatchLite {
  /** Team ids after resolving knockout slots (explicit team ids always win). */
  home: number | null;
  away: number | null;
}

/**
 * Fill knockout teams from group positions and earlier results.
 * A group slot only resolves once every match in that group is finished.
 */
export function resolveKnockouts(teams: TeamLite[], matches: MatchLite[]): ResolvedMatch[] {
  const standings = computeStandings(teams, matches);
  const groupDone = (group: string) =>
    matches.filter((m) => m.stage === "GROUP" && m.group === group).every(isFinished);

  const resolved = new Map<number, ResolvedMatch>();
  const sorted = [...matches].sort((a, b) => a.matchNo - b.matchNo);

  const resolveSlot = (slot: string | null): number | null => {
    if (!slot) return null;
    const group = slot.match(/^([A-D])([12])$/);
    if (group) {
      if (!groupDone(group[1])) return null;
      return standings[group[1]]?.[Number(group[2]) - 1]?.team.id ?? null;
    }
    const ko = slot.match(/^([WL])(\d+)$/);
    if (ko) {
      const source = resolved.get(Number(ko[2]));
      if (!source) return null;
      const winner = matchWinnerId({ ...source, team1Id: source.home, team2Id: source.away });
      if (winner == null) return null;
      if (ko[1] === "W") return winner;
      return winner === source.home ? source.away : source.home;
    }
    return null;
  };

  for (const m of sorted) {
    resolved.set(m.matchNo, {
      ...m,
      home: m.team1Id ?? resolveSlot(m.slot1),
      away: m.team2Id ?? resolveSlot(m.slot2),
    });
  }
  return sorted.map((m) => resolved.get(m.matchNo)!);
}
