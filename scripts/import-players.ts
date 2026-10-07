/**
 * Load player names from the organisers' masterfile into each team's roster (the scorer's dropdowns).
 *
 *   npm run players:import -- "path/to/masterfile.xlsx"             (dry run: reads only, writes nothing)
 *   npm run players:import -- "path/to/masterfile.xlsx" apply       (writes)
 *   npm run players:import:prod -- "path/to/masterfile.xlsx" apply  (production database in .env.neon)
 *
 * "apply" is a plain word, not a --flag: PowerShell drops the "--" separator when calling npm,
 * and npm then swallows any --flag itself.
 *
 * PRIVACY: reads only the "Team" sheet, and from it only the team name, each player's Name, and
 * each player's Age (for an under-18 count, never stored). Emirates IDs, parish numbers, phones and
 * emails are never read into the output, stored or printed. Player names are never printed either:
 * the output is counts only.
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { cleanName } from "../src/lib/scoring";

const SHEET = "Team";
const TEAM_NAME_COL = 4;
const FIRST_PLAYER_COL = 9;
const FIELDS_PER_PLAYER = 5; // Name, Age, Gender, Emirates ID No., Parish Registration Number
const MAX_PLAYERS = 12;

const prisma = new PrismaClient();

function text(cell: ExcelJS.Cell): string {
  return String(cell.text ?? "").trim();
}

/** Team names differ in case, spacing and dots between the sheets ("G.U.M CC" vs "G. U. M. CC"). */
const teamKey = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Registration-form team names that differ from the group draw's (keyed by teamKey of the sheet name). */
const ALIASES: Record<string, string> = {
  JESUSYOUTHTEAMB: "JESUS YOUTH B",
  GUMCCCRICKETCLUB: "G. U. M. CC",
};

async function main() {
  const [file, mode] = process.argv.slice(2);
  if (!file) {
    console.error('Usage: npm run players:import -- "masterfile.xlsx" [apply]');
    process.exit(1);
  }
  const dryRun = mode !== "apply";

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`No "${SHEET}" sheet in ${file}`);

  // Refuse to run if the layout isn't what we expect, so an ID column can never be taken for a name.
  const header = ws.getRow(1);
  if (!/team name/i.test(text(header.getCell(TEAM_NAME_COL)))) throw new Error(`Column ${TEAM_NAME_COL} is not "Team Name"`);
  for (let p = 0; p < MAX_PLAYERS; p++) {
    const col = FIRST_PLAYER_COL + p * FIELDS_PER_PLAYER;
    if (!new RegExp(`>>\\s*${p + 1}\\s*>>\\s*Name$`, "i").test(text(header.getCell(col)))) {
      throw new Error(`Column ${col} is not player ${p + 1}'s Name`);
    }
    if (!new RegExp(`>>\\s*${p + 1}\\s*>>\\s*Age$`, "i").test(text(header.getCell(col + 1)))) {
      throw new Error(`Column ${col + 1} is not player ${p + 1}'s Age`);
    }
  }

  const teams = await prisma.team.findMany();
  const byKey = new Map(teams.map((t) => [teamKey(t.name), t]));

  const unmatched: string[] = [];
  const perTeam: { team: string; found: number; added: number }[] = [];
  let skippedLookLikeIds = 0;
  let under18 = 0;
  let agesMissing = 0;
  let totalPlayers = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const sheetTeam = text(row.getCell(TEAM_NAME_COL));
    if (!sheetTeam) continue;
    const alias = ALIASES[teamKey(sheetTeam)];
    const team = byKey.get(teamKey(alias ?? sheetTeam));
    if (!team) {
      unmatched.push(sheetTeam);
      continue;
    }

    const names: string[] = [];
    for (let p = 0; p < MAX_PLAYERS; p++) {
      const col = FIRST_PLAYER_COL + p * FIELDS_PER_PLAYER;
      const raw = text(row.getCell(col));
      if (!raw) continue;
      if (/\d{5,}|@/.test(raw)) {
        skippedLookLikeIds++;
        continue;
      }
      const name = cleanName(raw);
      if (!name) continue;
      names.push(name);
      totalPlayers++;
      const age = Number.parseInt(text(row.getCell(col + 1)), 10);
      if (Number.isNaN(age)) agesMissing++;
      else if (age < 18) under18++;
    }

    const existing = await prisma.player.findMany({ where: { teamId: team.id } });
    const have = new Set(existing.map((p) => p.name.toLowerCase()));
    const fresh = names.filter((n) => {
      const key = n.toLowerCase();
      if (have.has(key)) return false;
      have.add(key);
      return true;
    });
    if (!dryRun && fresh.length) {
      await prisma.player.createMany({ data: fresh.map((name) => ({ teamId: team.id, name })), skipDuplicates: true });
    }
    perTeam.push({ team: team.name, found: names.length, added: fresh.length });
  }

  const host = (process.env.DATABASE_URL ?? "local .env").replace(/^.*@/, "").replace(/[/?].*$/, "");
  console.log(`${dryRun ? "DRY RUN (nothing written)" : "Imported"} · database: ${host}`);
  for (const t of perTeam.sort((a, b) => a.team.localeCompare(b.team))) {
    console.log(`  ${t.team}: ${t.found} players${dryRun ? `, ${t.added} would be new` : `, ${t.added} new`}`);
  }
  const missingTeams = teams.filter((t) => !perTeam.some((p) => p.team === t.name)).map((t) => t.name);
  console.log(`Players: ${totalPlayers} · under 18: ${under18} · age missing: ${agesMissing} · skipped (looked like an ID/phone): ${skippedLookLikeIds}`);
  if (unmatched.length) console.log(`Sheet teams not matched to a site team: ${unmatched.join(", ")}`);
  if (missingTeams.length) console.log(`Site teams with no row in the sheet: ${missingTeams.join(", ")}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
