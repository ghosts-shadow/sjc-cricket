/**
 * One-time extractor: organisers' masterfile (.xlsx) -> prisma/seed-data.json
 *
 *   npm run extract -- "path/to/Sports Fest cricket masterfile.xlsx"
 *
 * PRIVACY: only reads the "Group Draw", "Sheet1" and "Sheet3" sheets. The "Team" and
 * "Ind" sheets hold registration data (Emirates IDs, phones, emails) and must never
 * be read or copied. The output contains team names, fixtures and scores only.
 */
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import path from "node:path";

type Stage = "GROUP" | "QF" | "SF" | "THIRD" | "FINAL";

export interface SeedTeam {
  name: string;
  slug: string;
  group: string;
  drawPos: number;
}

export interface SeedMatch {
  matchNo: number;
  stage: Stage;
  group: string | null;
  startsAt: string; // ISO, UTC
  team1: string | null;
  team2: string | null;
  slot1: string | null;
  slot2: string | null;
  score1: number | null;
  score2: number | null;
  status: "SCHEDULED" | "COMPLETED";
  note: string | null;
}

type AllowedSheet = "Group Draw" | "Sheet1" | "Sheet3";

// Knockout slots, from the Schedule sheet. Group slot "A1" = Group A position 1,
// "W46" = winner of match 46, "L50" = loser of match 50.
const KNOCKOUT: Record<number, { stage: Stage; slot1: string; slot2: string }> = {
  46: { stage: "QF", slot1: "A1", slot2: "B2" },
  47: { stage: "QF", slot1: "C1", slot2: "D2" },
  48: { stage: "QF", slot1: "B1", slot2: "A2" },
  49: { stage: "QF", slot1: "D1", slot2: "C2" },
  50: { stage: "SF", slot1: "W46", slot2: "W47" },
  51: { stage: "SF", slot1: "W48", slot2: "W49" },
  52: { stage: "THIRD", slot1: "L50", slot2: "L51" },
  53: { stage: "FINAL", slot1: "W50", slot2: "W51" },
};

// Reschedules noted in the organisers' "Sheet2" (matches 9 and 15 were not played on 4 Oct).
// Confirm with organisers; they can also change any date from the admin page.
const RESCHEDULED: Record<number, { date: string; time: string; note: string }> = {
  9: { date: "01.11.2026", time: "07:00pm - 07:40pm", note: "Rescheduled from 4 Oct" },
  15: { date: "01.11.2026", time: "07:40pm - 08:20pm", note: "Rescheduled from 4 Oct" },
};

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return String(value.text);
    if (value instanceof Date) return value.toISOString();
    return "";
  }
  return String(value);
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  const text = cellText(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

export function normaliseName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "03.10.2026" + "05:40 pm - 06:20pm" -> UTC ISO string (Dubai is UTC+4, no DST). */
export function parseStart(date: string, time: string): string {
  const d = date.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!d) throw new Error(`Unparseable date: "${date}"`);
  const t = time.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?/);
  if (!t) throw new Error(`Unparseable time: "${time}"`);
  let hour = Number(t[1]);
  const minute = Number(t[2]);
  const meridiem = t[3] ?? "pm"; // every slot is in the evening
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return new Date(Date.UTC(Number(d[3]), Number(d[2]) - 1, Number(d[1]), hour - 4, minute)).toISOString();
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npm run extract -- "path/to/masterfile.xlsx"');
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = (name: AllowedSheet) => {
    const ws = workbook.getWorksheet(name);
    if (!ws) throw new Error(`Sheet "${name}" not found`);
    return ws;
  };

  // Teams: Group Draw, column B = team name, column C = draw slot ("A1".."D5").
  const teams: SeedTeam[] = [];
  sheet("Group Draw").eachRow((row) => {
    const name = normaliseName(cellText(row.getCell("B").value));
    const slot = cellText(row.getCell("C").value).trim().toUpperCase();
    const m = slot.match(/^([A-D])(\d)$/);
    if (!name || !m) return;
    teams.push({ name, slug: slugify(name), group: m[1], drawPos: Number(m[2]) });
  });
  const teamByName = new Map(teams.map((t) => [t.name, t]));

  // Scores: Sheet3, column R = match no, S = team 1, T = score 1, V = team 2, W = score 2.
  const scores = new Map<number, { team1: string; team2: string; score1: number | null; score2: number | null }>();
  sheet("Sheet3").eachRow((row) => {
    const matchNo = cellNumber(row.getCell("R").value);
    if (!matchNo) return;
    scores.set(matchNo, {
      team1: normaliseName(cellText(row.getCell("S").value)),
      team2: normaliseName(cellText(row.getCell("V").value)),
      score1: cellNumber(row.getCell("T").value),
      score2: cellNumber(row.getCell("W").value),
    });
  });

  // Fixtures: Sheet1, column B = date, C = time, E = match no, F = team 1, H = team 2.
  const matches: SeedMatch[] = [];
  sheet("Sheet1").eachRow((row) => {
    const matchNo = cellNumber(row.getCell("E").value);
    const date = cellText(row.getCell("B").value).trim();
    if (!matchNo || !/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(date)) return;
    const time = cellText(row.getCell("C").value);
    const ko = KNOCKOUT[matchNo];
    const moved = RESCHEDULED[matchNo];

    if (ko) {
      matches.push({
        matchNo,
        stage: ko.stage,
        group: null,
        startsAt: parseStart(date, time),
        team1: null,
        team2: null,
        slot1: ko.slot1,
        slot2: ko.slot2,
        score1: null,
        score2: null,
        status: "SCHEDULED",
        note: null,
      });
      return;
    }

    const team1 = normaliseName(cellText(row.getCell("F").value));
    const team2 = normaliseName(cellText(row.getCell("H").value));
    const t1 = teamByName.get(team1);
    const t2 = teamByName.get(team2);
    if (!t1 || !t2) throw new Error(`Match ${matchNo}: unknown team "${!t1 ? team1 : team2}"`);
    if (t1.group !== t2.group) throw new Error(`Match ${matchNo}: teams are in different groups`);

    const result = scores.get(matchNo);
    if (result && (result.team1 !== team1 || result.team2 !== team2)) {
      throw new Error(`Match ${matchNo}: Sheet1 and Sheet3 disagree on teams`);
    }
    const played = !moved && result?.score1 != null && result?.score2 != null;

    matches.push({
      matchNo,
      stage: "GROUP",
      group: t1.group,
      startsAt: moved ? parseStart(moved.date, moved.time) : parseStart(date, time),
      team1,
      team2,
      slot1: null,
      slot2: null,
      score1: played ? result!.score1 : null,
      score2: played ? result!.score2 : null,
      status: played ? "COMPLETED" : "SCHEDULED",
      note: moved?.note ?? null,
    });
  });

  matches.sort((a, b) => a.matchNo - b.matchNo);
  if (teams.length !== 21) throw new Error(`Expected 21 teams, found ${teams.length}`);
  if (matches.length !== 53) throw new Error(`Expected 53 matches, found ${matches.length}`);

  const out = path.join(__dirname, "..", "prisma", "seed-data.json");
  writeFileSync(out, JSON.stringify({ teams, matches }, null, 2) + "\n");
  const played = matches.filter((m) => m.status === "COMPLETED").length;
  console.log(`Wrote ${teams.length} teams, ${matches.length} matches (${played} with results) to prisma/seed-data.json`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
