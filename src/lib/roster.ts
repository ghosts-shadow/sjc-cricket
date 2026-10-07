import "server-only";
import { prisma } from "./db";
import { namesBySide, replay, type ScoreEvent, type ScoringSetup } from "./scoring";

export interface TeamIds {
  1: number;
  2: number;
}

/** Each side's roster, sorted by name, for the scorer's dropdowns. */
export async function getRosters(teamIds: TeamIds): Promise<{ 1: string[]; 2: string[] }> {
  const players = await prisma.player.findMany({
    where: { teamId: { in: [teamIds[1], teamIds[2]] } },
    orderBy: { name: "asc" },
  });
  return {
    1: players.filter((p) => p.teamId === teamIds[1]).map((p) => p.name),
    2: players.filter((p) => p.teamId === teamIds[2]).map((p) => p.name),
  };
}

/** Add any new names used in a scoring session to the two teams' rosters (case-insensitive match). */
export async function saveRosterNames(teamIds: TeamIds, setup: ScoringSetup, events: ScoreEvent[]): Promise<void> {
  const used = namesBySide(replay(setup, events));
  if (used[1].length === 0 && used[2].length === 0) return;

  const existing = await prisma.player.findMany({ where: { teamId: { in: [teamIds[1], teamIds[2]] } } });
  const have = new Set(existing.map((p) => `${p.teamId}:${p.name.toLowerCase()}`));
  const data: { teamId: number; name: string }[] = [];
  for (const side of [1, 2] as const) {
    for (const name of used[side]) {
      const key = `${teamIds[side]}:${name.toLowerCase()}`;
      if (have.has(key)) continue;
      have.add(key);
      data.push({ teamId: teamIds[side], name });
    }
  }
  if (data.length) await prisma.player.createMany({ data, skipDuplicates: true });
}
