import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireOrganiser } from "@/lib/auth";
import { getBattingStats, type BattingRow } from "@/lib/batting";
import { inputClass } from "../ui";

export const metadata: Metadata = { title: "Batting", robots: { index: false } };

export default function BattingPage(props: PageProps<"/admin/batting">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Batting searchParams={props.searchParams} />
    </Suspense>
  );
}

type Ranked = BattingRow & { rank: number };

/** Rank the full list first, so a search still shows each batter's place in the whole tournament. */
function rank(rows: BattingRow[], compare: (a: BattingRow, b: BattingRow) => number): Ranked[] {
  return [...rows].sort((a, b) => compare(a, b) || a.name.localeCompare(b.name)).map((row, i) => ({ ...row, rank: i + 1 }));
}

async function Batting({ searchParams }: { searchParams: PageProps<"/admin/batting">["searchParams"] }) {
  await requireOrganiser();
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").trim().slice(0, 40);
  await connection();
  const { rows, matches } = await getBattingStats();

  const byRuns = rank(rows, (a, b) => b.runs - a.runs || a.balls - b.balls);
  const byBoundaries = rank(
    rows.filter((r) => r.bonusRuns > 0),
    (a, b) => b.bonusRuns - a.bonusRuns || b.sixes - a.sixes || b.fours - a.fours,
  );
  const needle = q.toLowerCase();
  const match = (r: BattingRow) => !needle || r.name.toLowerCase().includes(needle) || r.team.toLowerCase().includes(needle);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm underline underline-offset-2">
          ← Results
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">Batting</h1>
        <p className="mt-1 text-sm text-muted">
          Every batter&apos;s runs and boundaries, from {matches} match{matches === 1 ? "" : "es"} scored live with a batter on strike. Matches
          scored before 17 Oct only have pair totals, so they aren&apos;t counted here. Organisers only: player names aren&apos;t public.
        </p>
      </div>

      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Search a batter or team" aria-label="Search a batter or team" className={inputClass} />
        <button className="shrink-0 rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover">Search</button>
        {q && (
          <Link href="/admin/batting" className="flex shrink-0 items-center rounded-md border border-line px-3 text-sm hover:border-muted">
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">No per-batter scores yet. They start with the first match scored live after this update.</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Panel
            title="Runs"
            empty={q ? `No batter or team matches “${q}”.` : "No runs yet."}
            head={["Inn", "R", "B", "Out", "Net"]}
            titles={["Innings batted", "Runs off the bat", "Balls faced", "Times out (−5 each)", "Runs minus 5 per out"]}
            rows={byRuns.filter(match)}
            cells={(r) => [r.innings, r.runs, r.balls, r.outs || "–", r.net]}
            strong={1}
            phoneHidden={[0]}
          />
          <Panel
            title="Boundaries"
            empty={q ? `No boundaries for “${q}”.` : "No boundaries yet."}
            head={["Bdry", "4s", "6s", "R"]}
            titles={["Boundary runs: off the nets and posts", "Back net on the bounce", "Back net on the full, or out over", "All runs off the bat"]}
            rows={byBoundaries.filter(match)}
            cells={(r) => [r.bonusRuns, r.fours || "–", r.sixes || "–", r.runs]}
            strong={0}
          />
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  empty,
  head,
  titles,
  rows,
  cells,
  strong,
  phoneHidden = [],
}: {
  title: string;
  empty: string;
  head: string[];
  titles: string[];
  rows: Ranked[];
  cells: (row: Ranked) => (string | number)[];
  /** Index of the column the panel is ranked by. */
  strong: number;
  /** Columns left out on phone screens, so the rest fit without scrolling sideways. */
  phoneHidden?: number[];
}) {
  const hide = (i: number) => (phoneHidden.includes(i) ? "hidden sm:table-cell" : "");
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <h2 className="border-b border-line bg-soft px-3 py-2 font-display text-lg font-semibold leading-none">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead className="text-[11px] uppercase tracking-[.1em] text-muted">
              <tr className="border-b border-line">
                <th className="w-8 px-2 py-1.5 text-left font-semibold">#</th>
                <th className="px-2 py-1.5 text-left font-semibold">Batter</th>
                {head.map((h, i) => (
                  <th key={h} title={titles[i]} className={`px-1.5 py-1.5 text-right font-semibold last:pr-2 ${i === strong ? "text-foreground" : ""} ${hide(i)}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-line last:border-0">
                  <td className="px-2 py-1.5 text-muted">{row.rank}</td>
                  <td className="max-w-44 px-2 py-1.5">
                    <span className="block truncate font-medium">{row.name}</span>
                    <span className="block truncate text-xs text-muted">{row.team}</span>
                  </td>
                  {cells(row).map((value, i) => (
                    <td
                      key={head[i]}
                      className={`px-1.5 py-1.5 text-right last:pr-2 ${i === strong ? "font-display text-lg font-semibold leading-none" : ""} ${hide(i)}`}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
