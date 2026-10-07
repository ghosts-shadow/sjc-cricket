import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { GroupBadge, MatchDays, PastToggle } from "@/components/cricket";
import { getTournament } from "@/lib/data";
import { dayKey } from "@/lib/format";
import { GROUPS } from "@/lib/tournament";

export const metadata: Metadata = { title: "Fixtures & results" };

const FILTERS = [{ key: "all", label: "All" }, ...GROUPS.map((g) => ({ key: g, label: `Group ${g}` })), { key: "ko", label: "Knockouts" }];

export default function FixturesPage(props: PageProps<"/fixtures">) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">Fixtures &amp; results</h1>
      <Suspense fallback={<p className="text-sm text-muted">Loading fixtures…</p>}>
        <FilteredFixtures searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

/** /fixtures?group=B&past=1, leaving out defaults so the plain URL stays /fixtures. */
function fixturesHref(group: string, past: boolean): string {
  const query = new URLSearchParams();
  if (group !== "all") query.set("group", group);
  if (past) query.set("past", "1");
  const qs = query.toString();
  return qs ? `/fixtures?${qs}` : "/fixtures";
}

async function FilteredFixtures({ searchParams }: { searchParams: PageProps<"/fixtures">["searchParams"] }) {
  const params = await searchParams;
  const filter = typeof params.group === "string" && FILTERS.some((f) => f.key === params.group) ? params.group : "all";
  const showPast = params.past === "1";
  await connection();
  const today = dayKey(new Date().toISOString());

  const { matches } = await getTournament();
  const inFilter = matches.filter((m) => (filter === "all" ? true : filter === "ko" ? m.stage !== "GROUP" : m.group === filter));
  const pastCount = inFilter.filter((m) => dayKey(m.startsAt) < today).length;
  const shown = showPast ? inFilter : inFilter.filter((m) => dayKey(m.startsAt) >= today);

  return (
    <>
      <nav className="flex flex-wrap gap-2" aria-label="Filter fixtures">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={fixturesHref(f.key, showPast)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
              f.key === filter ? "border-edge bg-raised text-foreground" : "border-line text-muted hover:text-foreground"
            }`}
          >
            {f.key.length === 1 && <GroupBadge group={f.key} />}
            {f.label}
          </Link>
        ))}
        <PastToggle showPast={showPast} pastCount={pastCount} href={fixturesHref(filter, !showPast)} />
      </nav>
      <MatchDays matches={shown} emptyText={pastCount ? "No more matches to come. Show past matches to see the results." : "No matches."} />
    </>
  );
}
