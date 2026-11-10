import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { GenderChips, inGender, LeaderNav, LeaderTable, matches as matching, SearchForm, viewFrom } from "@/components/leaderboard";
import { requireOrganiser } from "@/lib/auth";
import { battingAverage, battingStrikeRate, rankBy, type BattingRow, type Column } from "@/lib/leaders";
import { getPlayerStats } from "@/lib/stats";

export const metadata: Metadata = { title: "Batting", robots: { index: false } };

export default function BattingPage(props: PageProps<"/admin/batting">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Batting searchParams={props.searchParams} />
    </Suspense>
  );
}

/** Average and strike rate need a few balls, or one lucky hit tops the list (a batter faces about 6 a match). */
const MIN_BALLS = 12;
const enoughBalls = { qualifies: (r: BattingRow) => r.balls >= MIN_BALLS, minimum: `${MIN_BALLS}+ balls faced` };

const USUAL = "runs";
const COLUMNS: Column<BattingRow>[] = [
  { key: "runs", head: "R", title: "Runs off the bat", value: (r) => r.runs },
  { key: "outs", head: "Out", title: "Times out", value: (r) => r.outs, show: (r) => r.outs || "–" },
  { key: "balls", head: "B", title: "Balls faced", value: (r) => r.balls },
  {
    key: "avg",
    head: "Avg",
    title: "Average: runs per time out",
    value: battingAverage,
    show: (r) => `${battingAverage(r).toFixed(1)}${r.outs ? "" : "*"}`,
    ...enoughBalls,
  },
  { key: "fours", head: "4s", title: "Boundaries: fours off the back net", value: (r) => r.fours, show: (r) => r.fours || "–" },
  { key: "sixes", head: "6s", title: "Sixes", value: (r) => r.sixes, show: (r) => r.sixes || "–" },
  { key: "sr", head: "SR", title: "Strike rate: runs per 100 balls", value: battingStrikeRate, show: (r) => battingStrikeRate(r).toFixed(1), ...enoughBalls },
  { key: "matches", head: "M", title: "Matches batted in", value: (r) => r.innings },
];

async function Batting({ searchParams }: { searchParams: PageProps<"/admin/batting">["searchParams"] }) {
  await requireOrganiser();
  const { view, column } = viewFrom(await searchParams, COLUMNS, USUAL);
  await connection();
  const { batting: everyone, matches } = await getPlayerStats();
  const ranked = rankBy(everyone.filter(inGender(view.gender)), column, (a, b) => b.runs - a.runs || a.balls - b.balls);

  return (
    <div className="space-y-6">
      <div>
        <LeaderNav current="batting" />
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">Batting</h1>
        <p className="mt-1 text-sm text-muted">
          Every batter&apos;s figures from all {matches} match{matches === 1 ? "" : "es"} played so far (walkovers have no play). An average with a *
          means never out, so it&apos;s their runs. For the 10 Oct matches (16 to 22), who faced each ball is a best estimate from the scoreboards.
          Organisers only: player names aren&apos;t public.
        </p>
      </div>

      <div className="space-y-3">
        <GenderChips view={view} href="/admin/batting" />
        <SearchForm view={view} href="/admin/batting" placeholder="Search a batter or team" />
      </div>

      {everyone.length === 0 ? (
        <p className="text-sm text-muted">No batting figures yet. They start with the first match scored live.</p>
      ) : (
        <LeaderTable
          who="Batter"
          columns={COLUMNS}
          sorted={column}
          usual={USUAL}
          rows={ranked.filter(matching(view.q))}
          view={view}
          href="/admin/batting"
          empty={`No batter or team matches “${view.q}”.`}
        />
      )}
    </div>
  );
}
