import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GroupBadge, MatchDays } from "@/components/cricket";
import { getTournament } from "@/lib/data";
import { GROUPS } from "@/lib/tournament";

export const metadata: Metadata = { title: "Fixtures & results" };

const FILTERS = [{ key: "all", label: "All" }, ...GROUPS.map((g) => ({ key: g, label: `Group ${g}` })), { key: "ko", label: "Knockouts" }];

export default function FixturesPage(props: PageProps<"/fixtures">) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl font-bold leading-none sm:text-5xl">Fixtures &amp; results</h1>
      <Suspense fallback={<p className="text-sm text-muted">Loading fixtures…</p>}>
        <FilteredFixtures searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function FilteredFixtures({ searchParams }: { searchParams: PageProps<"/fixtures">["searchParams"] }) {
  const raw = (await searchParams).group;
  const filter = typeof raw === "string" && FILTERS.some((f) => f.key === raw) ? raw : "all";
  const { matches } = await getTournament();
  const shown = matches.filter((m) =>
    filter === "all" ? true : filter === "ko" ? m.stage !== "GROUP" : m.group === filter,
  );

  return (
    <>
      <nav className="flex flex-wrap gap-2" aria-label="Filter fixtures">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/fixtures" : `/fixtures?group=${f.key}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
              f.key === filter ? "border-foreground bg-foreground text-card" : "border-line bg-card hover:border-muted"
            }`}
          >
            {f.key.length === 1 && <GroupBadge group={f.key} />}
            {f.label}
          </Link>
        ))}
      </nav>
      <MatchDays matches={shown} />
    </>
  );
}
