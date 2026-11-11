import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { GenderChips, inGender, LeaderNav, LeaderTable, matches as matching, SearchForm, viewFrom } from "@/components/leaderboard";
import { requireOrganiser } from "@/lib/auth";
import { bowlingAverage, bowlingStrikeRate, economy, extrasBowled, MIN_OVERS, rankBy, type BowlingRow, type Column } from "@/lib/leaders";
import { getPlayerStats } from "@/lib/stats";

export const metadata: Metadata = { title: "Bowling", robots: { index: false } };

export default function BowlingPage(props: PageProps<"/admin/bowling">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Bowling searchParams={props.searchParams} />
    </Suspense>
  );
}

const enoughOvers = { qualifies: (r: BowlingRow) => r.overs >= MIN_OVERS, minimum: `${MIN_OVERS}+ overs bowled` };
const rate = (value: number | null) => (value == null ? "–" : value.toFixed(1));

const USUAL = "wickets";
const COLUMNS: Column<BowlingRow>[] = [
  { key: "wickets", head: "W", title: "Wickets", value: (r) => r.wickets, show: (r) => r.wickets || "–" },
  { key: "overs", head: "Ov", title: "Overs bowled", value: (r) => r.overs },
  { key: "runs", head: "R", title: "Runs given", value: (r) => r.runs },
  { key: "econ", head: "Econ", title: "Economy rate: runs given per over", value: economy, show: (r) => rate(economy(r)), best: "asc", ...enoughOvers },
  { key: "avg", head: "Avg", title: "Average: runs given per wicket", value: bowlingAverage, show: (r) => rate(bowlingAverage(r)), best: "asc", ...enoughOvers },
  {
    key: "sr",
    head: "SR",
    title: "Strike rate: balls bowled per wicket",
    value: bowlingStrikeRate,
    show: (r) => rate(bowlingStrikeRate(r)),
    best: "asc",
    ...enoughOvers,
  },
  { key: "extras", head: "Ext", title: "Extras given: no-balls, wides and dead balls", value: extrasBowled, show: (r) => extrasBowled(r) || "–" },
  { key: "nb", head: "Nb", title: "No-balls", value: (r) => r.noBalls, show: (r) => r.noBalls || "–" },
  { key: "wd", head: "Wd", title: "Wides", value: (r) => r.wides, show: (r) => r.wides || "–" },
  { key: "db", head: "Db", title: "Dead balls", value: (r) => r.deadBalls, show: (r) => r.deadBalls || "–" },
];

async function Bowling({ searchParams }: { searchParams: PageProps<"/admin/bowling">["searchParams"] }) {
  await requireOrganiser();
  const { view, column } = viewFrom(await searchParams, COLUMNS, USUAL);
  await connection();
  const { bowling: everyone, matches } = await getPlayerStats();
  const ranked = rankBy(everyone.filter(inGender(view.gender)), column, (a, b) => b.wickets - a.wickets || a.runs - b.runs);

  return (
    <div className="space-y-6">
      <div>
        <LeaderNav current="bowling" />
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">Bowling</h1>
        <p className="mt-1 text-sm text-muted">
          Every bowler&apos;s figures from all {matches} match{matches === 1 ? "" : "es"} played so far (walkovers have no play). Runs given include
          wides, no-balls and penalty runs; every wicket in a bowler&apos;s over counts as theirs, run outs included. Organisers only: player names
          aren&apos;t public.
        </p>
      </div>

      <div className="space-y-3">
        <GenderChips view={view} href="/admin/bowling" />
        <SearchForm view={view} href="/admin/bowling" placeholder="Search a bowler or team" />
      </div>

      {everyone.length === 0 ? (
        <p className="text-sm text-muted">No bowling figures yet.</p>
      ) : (
        <LeaderTable
          who="Bowler"
          columns={COLUMNS}
          sorted={column}
          usual={USUAL}
          rows={ranked.filter(matching(view.q))}
          view={view}
          href="/admin/bowling"
          empty={`No bowler or team matches “${view.q}”.`}
        />
      )}
    </div>
  );
}
