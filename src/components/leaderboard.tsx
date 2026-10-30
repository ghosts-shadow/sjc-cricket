import Link from "next/link";
import { inputClass } from "@/app/admin/ui";

/** Anything a leaderboard can list: one player on one team. */
export interface LeaderRow {
  key: string;
  name: string;
  team: string;
}

export type Ranked<T extends LeaderRow> = T & { rank: number };

/** Rank the full list first, so a search still shows each player's place in the whole tournament. */
export function rank<T extends LeaderRow>(rows: T[], compare: (a: T, b: T) => number): Ranked<T>[] {
  return [...rows].sort((a, b) => compare(a, b) || a.name.localeCompare(b.name)).map((row, i) => ({ ...row, rank: i + 1 }));
}

/** Case-insensitive match on player or team name; an empty search matches everyone. */
export function matches(q: string) {
  const needle = q.toLowerCase();
  return (r: LeaderRow) => !needle || r.name.toLowerCase().includes(needle) || r.team.toLowerCase().includes(needle);
}

/** The search box above the panels: a plain GET form, so it works without JavaScript. */
export function SearchForm({ q, href, placeholder }: { q: string; href: string; placeholder: string }) {
  return (
    <form className="flex gap-2" role="search">
      <input name="q" defaultValue={q} placeholder={placeholder} aria-label={placeholder} className={inputClass} />
      <button className="shrink-0 rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover">Search</button>
      {q && (
        <Link href={href} className="flex shrink-0 items-center rounded-md border border-line px-3 text-sm hover:border-muted">
          Clear
        </Link>
      )}
    </form>
  );
}

export function Panel<T extends LeaderRow>({
  title,
  who,
  note,
  empty,
  head,
  titles,
  rows,
  cells,
  strong,
  phoneHidden = [],
}: {
  title: string;
  /** Header of the name column: "Batter" or "Bowler". */
  who: string;
  /** A line under the title, e.g. a qualifying minimum. */
  note?: string;
  empty: string;
  head: string[];
  titles: string[];
  rows: Ranked<T>[];
  cells: (row: Ranked<T>) => (string | number)[];
  /** Index of the column the panel is ranked by. */
  strong: number;
  /** Columns left out on phone screens, so the rest fit without scrolling sideways. */
  phoneHidden?: number[];
}) {
  const hide = (i: number) => (phoneHidden.includes(i) ? "hidden sm:table-cell" : "");
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="border-b border-line bg-soft px-3 py-2">
        <h2 className="font-display text-lg font-semibold leading-none">{title}</h2>
        {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead className="text-[11px] uppercase tracking-[.1em] text-muted">
              <tr className="border-b border-line">
                <th className="w-8 px-2 py-1.5 text-left font-semibold">#</th>
                <th className="px-2 py-1.5 text-left font-semibold">{who}</th>
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
