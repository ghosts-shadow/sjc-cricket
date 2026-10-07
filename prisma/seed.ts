/**
 * Loads prisma/seed-data.json (made by `npm run extract`) into the database.
 * Safe to re-run: existing teams and matches are left untouched, so results
 * entered by organisers are never overwritten.
 */
import { PrismaClient, type MatchStatus, type Stage } from "@prisma/client";
import seed from "./seed-data.json";

const prisma = new PrismaClient();

async function main() {
  let teamsCreated = 0;
  for (const t of seed.teams) {
    const existing = await prisma.team.findUnique({ where: { name: t.name } });
    if (existing) continue;
    await prisma.team.create({ data: t });
    teamsCreated++;
  }

  const teamId = new Map((await prisma.team.findMany()).map((t) => [t.name, t.id]));
  let matchesCreated = 0;
  for (const m of seed.matches) {
    const existing = await prisma.match.findUnique({ where: { matchNo: m.matchNo } });
    if (existing) continue;
    await prisma.match.create({
      data: {
        matchNo: m.matchNo,
        stage: m.stage as Stage,
        group: m.group,
        startsAt: new Date(m.startsAt),
        team1Id: m.team1 ? teamId.get(m.team1)! : null,
        team2Id: m.team2 ? teamId.get(m.team2)! : null,
        slot1: m.slot1,
        slot2: m.slot2,
        score1: m.score1,
        score2: m.score2,
        status: m.status as MatchStatus,
        note: m.note,
      },
    });
    matchesCreated++;
  }

  console.log(`Seeded ${teamsCreated} new teams and ${matchesCreated} new matches.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
