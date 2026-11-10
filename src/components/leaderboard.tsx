import Link from "next/link";
import { inputClass } from "@/app/admin/ui";
import type { Column } from "@/lib/leaders";

/** Anything a leaderboard can list: one player on one team. */
export interface LeaderRow {
  key: string;
  name: string;
  team: string;
  female: boolean;
}

/** Case-insensitive match on player or team name; an empty search matches everyone. */
export function matches(q: string) {
  const needle = q.toLowerCase();
  return (r: LeaderRow) => !needle || r.name.toLowerCase().includes(needle) || r.team.toLowerCase().includes(needle);
}

export type Gender = "all" | "f" | "m";

/** ?gender=f or ?gender=m; anything else shows everyone. */
export function genderFrom(value: string | string[] | undefined): Gender {
  return value === "f" || value === "m" ? value : "all";
}

export function inGender(gender: Gender) {
  return (r: LeaderRow) => gender === "all" || r.female === (gender === "f");
}

/** What a leaderboard page is showing. `sort` is "" for the page's usual column. */
export interface View {
  gender: Gender;
  q: string;
  sort: string;
}

/**
 * Read ?gender, ?q and ?sort. Rank after the Female / Male filter but before the search: ranks restart
 * at 1 for each gender, and a search still shows each player's place in the list being looked at.
 */
export function viewFrom<T>(
  params: Record<string, string | string[] | undefined>,
  columns: Column<T>[],
  usual: string,
): { view: View; column: Column<T> } {
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 40);
  const column = columns.find((c) => c.key === params.sort) ?? columns.find((c) => c.key === usual)!;
  return { view: { gender: genderFrom(params.gender), q, sort: column.key === usual ? "" : column.key }, column };
}

/** The page with this view, leaving out defaults so the plain URL stays clean. */
function leaderHref(href: string, view: View): string {
  const query = new URLSearchParams();
  if (view.gender !== "all") query.set("gender", view.gender);
  if (view.sort) query.set("sort", view.sort);
  if (view.q) query.set("q", view.q);
  const qs = query.toString();
  return qs ? `${href}?${qs}` : href;
}

const GENDERS: { key: Gender; label: string }[] = [
  { key: "all", label: "All" },
  { key: "f", label: "Female" },
  { key: "m", label: "Male" },
];

/** All / Female / Male, keeping the search and the sort. Plain links, like the group filter on Fixtures. */
export function GenderChips({ view, href }: { view: View; href: string }) {
  return (
    <div>
      <nav className="flex flex-wrap gap-2" aria-label="Female or male players">
        {GENDERS.map((g) => (
          <Link
            key={g.key}
            href={leaderHref(href, { ...view, gender: g.key })}
            aria-current={g.key === view.gender ? "page" : undefined}
            className={`inline-flex items-center rounded-full border px-3 py-1 text-sm ${
              g.key === view.gender ? "border-edge bg-raised text-foreground" : "border-line text-muted hover:text-foreground"
            }`}
          >
            {g.label}
          </Link>
        ))}
      </nav>
      {view.gender !== "all" && (
        <p className="mt-1.5 text-xs text-muted">
          Female means anyone who bowled or faced a female over, or is marked F on their team&apos;s players. Everyone else counts as male.
          Ranks are within this list.
        </p>
      )}
    </div>
  );
}

/** The search box above the table: a plain GET form, so it works without JavaScript. It keeps the gender and the sort. */
export function SearchForm({ view, href, placeholder }: { view: View; href: string; placeholder: string }) {
  return (
    <form className="flex gap-2" role="search">
      {view.gender !== "all" && <input type="hidden" name="gender" value={view.gender} />}
      {view.sort && <input type="hidden" name="sort" value={view.sort} />}
      <input name="q" defaultValue={view.q} placeholder={placeholder} aria-label={placeholder} className={inputClass} />
      <button className="shrink-0 rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover">Search</button>
      {view.q && (
        <Link href={leaderHref(href, { ...view, q: "" })} className="flex shrink-0 items-center rounded-md border border-line px-3 text-sm hover:border-muted">
          Clear
        </Link>
      )}
    </form>
  );
}

/** Links between the organisers' three player tables. */
export function LeaderNav({ current }: { current: "batting" | "bowling" | "mvp" }) {
  const pages = [
    { key: "batting", label: "Batting", href: "/admin/batting" },
    { key: "bowling", label: "Bowling", href: "/admin/bowling" },
    { key: "mvp", label: "MVP", href: "/admin/mvp" },
  ] as const;
  return (
    <div className="flex flex-wrap gap-x-4 text-sm">
      <Link href="/admin" className="underline underline-offset-2">
        ← Results
      </Link>
      {pages
        .filter((p) => p.key !== current)
        .map((p) => (
          <Link key={p.key} href={p.href} className="underline underline-offset-2">
            {p.label} →
          </Link>
        ))}
    </div>
  );
}

/**
 * One table with every column, sorted by the one whose heading was tapped. The player column stays put
 * while the numbers scroll sideways on a phone.
 */
export function LeaderTable<T extends LeaderRow>({
  who,
  columns,
  sorted,
  usual,
  rows,
  view,
  href,
  empty,
}: {
  /** Header of the name column: "Batter", "Bowler" or "Player". */
  who: string;
  columns: Column<T>[];
  /** The column the rows are ranked by. */
  sorted: Column<T>;
  /** The key of the page's usual sort column, left out of the links. */
  usual: string;
  rows: (T & { rank: number })[];
  view: View;
  href: string;
  empty: string;
}) {
  const lowest = sorted.best === "asc";
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <p className="border-b border-line bg-soft px-3 py-2 text-xs text-muted">
        Sorted by: <span className="font-medium text-foreground">{sorted.title}</span>, {lowest ? "lowest" : "highest"} first. Tap a column
        heading to sort by it.{sorted.minimum ? ` Players without ${sorted.minimum} are listed after the rest, with no rank.` : ""}
      </p>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead className="text-[11px] uppercase tracking-[.1em] text-muted">
              <tr className="border-b border-line">
                <th className="w-8 px-2 py-1.5 text-left font-semibold">#</th>
                <th className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left font-semibold">{who}</th>
                <th title="Female or male" className="px-1.5 py-1.5 text-center font-semibold">
                  F/M
                </th>
                {columns.map((c) => {
                  const on = c.key === sorted.key;
                  return (
                    <th key={c.key} aria-sort={on ? (lowest ? "ascending" : "descending") : undefined} className="px-1.5 py-1.5 text-right font-semibold last:pr-2">
                      <Link
                        href={leaderHref(href, { ...view, sort: c.key === usual ? "" : c.key })}
                        title={c.title}
                        className={`whitespace-nowrap underline-offset-2 hover:underline ${on ? "text-foreground" : ""}`}
                      >
                        {c.head}
                        {on ? (lowest ? " ↑" : " ↓") : ""}
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-line last:border-0">
                  <td className="px-2 py-1.5 text-muted">{row.rank || "–"}</td>
                  <td className="sticky left-0 z-10 max-w-36 bg-card px-2 py-1.5 sm:max-w-64">
                    <span className="block truncate font-medium">{row.name}</span>
                    <span className="block truncate text-xs text-muted">{row.team}</span>
                  </td>
                  <td className="px-1.5 py-1.5 text-center text-muted">{row.female ? "F" : "M"}</td>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap px-1.5 py-1.5 text-right last:pr-2 ${c.key === sorted.key ? "font-display text-lg font-semibold leading-none" : ""}`}
                    >
                      {c.show ? c.show(row) : (c.value(row) ?? "–")}
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
