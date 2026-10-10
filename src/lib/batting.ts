import "server-only";
import { getTournamentLive } from "./data";
import { prisma } from "./db";
import { parseEvents, parseSetup, replay } from "./scoring";

/** One batter's tournament totals, from submitted matches scored with a striker on each ball. */
export interface BattingRow {
  key: string;
  name: string;
  team: string;
  innings: number;
  runs: number;
  balls: number;
  bonusRuns: number; // the scoresheet's "boundary" runs: off the nets and posts
  fours: number;
  sixes: number;
  outs: number;
  net: number;
}

/**
 * Per-batter totals across every submitted scoring session. Batters are matched by team and name
 * (case-insensitive), the same way the scorer's roster dropdowns are. Matches scored before
 * per-batter scoring (no striker on the balls) add nothing.
 */
export async function getBattingStats(): Promise<{ rows: BattingRow[]; matches: number }> {
  const [{ matches }, sessions] = await Promise.all([
    getTournamentLive(),
    prisma.scoringSession.findMany({ where: { submitted: true }, select: { setup: true, events: true, match: { select: { matchNo: true } } } }),
  ]);
  const byNo = new Map(matches.map((m) => [m.matchNo, m]));
  const rows = new Map<string, BattingRow>();
  let counted = 0;

  for (const session of sessions) {
    const view = byNo.get(session.match.matchNo);
    const setup = parseSetup(session.setup);
    const events = parseEvents(session.events);
    if (!view?.home || !view.away || !setup || !events) continue;
    let any = false;
    for (const inn of replay(setup, events).innings) {
      const team = inn.battingTeam === 1 ? view.home : view.away;
      for (const b of inn.batters) {
        if (b.balls === 0 && b.outs === 0) continue;
        any = true;
        const key = `${team.id}:${b.name.toLowerCase()}`;
        const row = rows.get(key) ?? { key, name: b.name, team: team.name, innings: 0, runs: 0, balls: 0, bonusRuns: 0, fours: 0, sixes: 0, outs: 0, net: 0 };
        row.innings++;
        row.runs += b.runs;
        row.balls += b.balls;
        row.bonusRuns += b.bonusRuns;
        row.fours += b.fours;
        row.sixes += b.sixes;
        row.outs += b.outs;
        row.net += b.net;
        rows.set(key, row);
      }
    }
    if (any) counted++;
  }
  return { rows: [...rows.values()], matches: counted };
}
