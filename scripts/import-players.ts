/**
 * Load each team's roster and captain contact from the organisers' masterfile.
 *
 *   npm run players:import -- "path/to/masterfile.xlsx"             (dry run: reads only, writes nothing)
 *   npm run players:import -- "path/to/masterfile.xlsx" apply       (writes)
 *   npm run players:import:prod -- "path/to/masterfile.xlsx" apply  (production database in .env.neon)
 *
 * "apply" is a plain word, not a --flag: PowerShell drops the "--" separator when calling npm,
 * and npm then swallows any --flag itself.
 *
 * PRIVACY: reads only the "Team" sheet, and from it only: team name; captain name, phone and email;
 * and each player's name and gender. Ages, Emirates IDs and parish registration numbers are never
 * read into the output, stored or printed. Nothing personal is printed: the output is counts only.
 * All of it is shown on organiser screens only.
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { cleanName } from "../src/lib/scoring";

const SHEET = "Team";
const COL = { team: 4, captain: 5, phone: 6, email: 7 };
const FIRST_PLAYER_COL = 9;
const FIELDS_PER_PLAYER = 5; // Name, Age, Gender, Emirates ID No., Parish Registration Number
const NAME = 0;
const GENDER = 2;
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

function femaleFrom(value: string): boolean | null {
  if (/^f(emale)?$/i.test(value)) return true;
  if (/^m(ale)?$/i.test(value)) return false;
  return null;
}

/** Abort unless every column we read has the header we expect, so an ID column can never be read by mistake. */
function checkHeader(header: ExcelJS.Row) {
  const expect = (col: number, pattern: RegExp, what: string) => {
    if (!pattern.test(text(header.getCell(col)))) throw new Error(`Column ${col} is not "${what}"`);
  };
  expect(COL.team, /^team name$/i, "Team Name");
  expect(COL.captain, /^team captain$/i, "Team Captain");
  expect(COL.phone, /^contact number$/i, "Contact Number");
  expect(COL.email, /^email address$/i, "Email Address");
  for (let p = 0; p < MAX_PLAYERS; p++) {
    const col = FIRST_PLAYER_COL + p * FIELDS_PER_PLAYER;
    expect(col + NAME, new RegExp(`>>\\s*${p + 1}\\s*>>\\s*Name$`, "i"), `player ${p + 1} Name`);
    expect(col + GENDER, new RegExp(`>>\\s*${p + 1}\\s*>>\\s*Gender$`, "i"), `player ${p + 1} Gender`);
  }
}

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
  checkHeader(ws.getRow(1));

  const teams = await prisma.team.findMany();
  const byKey = new Map(teams.map((t) => [teamKey(t.name), t]));

  const unmatched: string[] = [];
  const perTeam: { team: string; players: number; added: number; updated: number; contact: boolean }[] = [];
  const totals = { players: 0, female: 0, genderMissing: 0, skipped: 0 };

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const sheetTeam = text(row.getCell(COL.team));
    if (!sheetTeam) continue;
    const team = byKey.get(teamKey(ALIASES[teamKey(sheetTeam)] ?? sheetTeam));
    if (!team) {
      unmatched.push(sheetTeam);
      continue;
    }

    // Captain contact, so organisers can reach the team.
    const contact = {
      captainName: cleanName(text(row.getCell(COL.captain))),
      captainPhone: text(row.getCell(COL.phone)).replace(/\s+/g, " ") || null,
      captainEmail: text(row.getCell(COL.email)).toLowerCase() || null,
    };
    const hasContact = Boolean(contact.captainName || contact.captainPhone || contact.captainEmail);
    if (!dryRun && hasContact) await prisma.team.update({ where: { id: team.id }, data: contact });

    // Players: name and gender.
    const players: { name: string; female: boolean | null }[] = [];
    for (let p = 0; p < MAX_PLAYERS; p++) {
      const col = FIRST_PLAYER_COL + p * FIELDS_PER_PLAYER;
      const raw = text(row.getCell(col + NAME));
      if (!raw) continue;
      if (/\d{5,}|@/.test(raw)) {
        totals.skipped++;
        continue;
      }
      const name = cleanName(raw);
      if (!name || players.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
      const female = femaleFrom(text(row.getCell(col + GENDER)));
      players.push({ name, female });
      totals.players++;
      if (female === null) totals.genderMissing++;
      else if (female) totals.female++;
    }

    const existing = await prisma.player.findMany({ where: { teamId: team.id } });
    const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p]));
    let added = 0;
    let updated = 0;
    for (const p of players) {
      const found = byName.get(p.name.toLowerCase());
      if (!found) {
        added++;
        if (!dryRun) await prisma.player.create({ data: { teamId: team.id, ...p } });
      } else if (found.female !== p.female) {
        updated++;
        if (!dryRun) await prisma.player.update({ where: { id: found.id }, data: { female: p.female } });
      }
    }
    perTeam.push({ team: team.name, players: players.length, added, updated, contact: hasContact });
  }

  const host = (process.env.DATABASE_URL ?? "local .env").replace(/^.*@/, "").replace(/[/?].*$/, "");
  const verb = dryRun ? "would be" : "";
  console.log(`${dryRun ? "DRY RUN (nothing written)" : "Imported"} · database: ${host}`);
  for (const t of perTeam.sort((a, b) => a.team.localeCompare(b.team))) {
    console.log(`  ${t.team}: ${t.players} players (${t.added} ${verb} new, ${t.updated} ${verb} updated) · captain contact: ${t.contact ? "yes" : "none"}`);
  }
  console.log(
    `Players: ${totals.players} · female: ${totals.female} · gender missing: ${totals.genderMissing} · skipped (looked like an ID/phone): ${totals.skipped}`,
  );
  const missingTeams = teams.filter((t) => !perTeam.some((p) => p.team === t.name)).map((t) => t.name);
  if (unmatched.length) console.log(`Sheet rows not matched to a site team: ${unmatched.length} (add them to ALIASES)`);
  if (missingTeams.length) console.log(`Site teams with no row in the sheet: ${missingTeams.join(", ")}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
