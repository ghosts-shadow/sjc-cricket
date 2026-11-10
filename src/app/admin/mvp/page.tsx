import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { GenderChips, inGender, LeaderNav, LeaderTable, matches as matching, SearchForm, viewFrom } from "@/components/leaderboard";
import { requireOrganiser } from "@/lib/auth";
import { rankBy, type Column, type MvpRow } from "@/lib/leaders";
import { getPlayerStats } from "@/lib/stats";

export const metadata: Metadata = { title: "MVP", robots: { index: false } };

export default function MvpPage(props: PageProps<"/admin/mvp">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Mvp searchParams={props.searchParams} />
    </Suspense>
  );
}

const USUAL = "mvp";
// The score first, so it's on screen on a phone; then what it's made from.
const COLUMNS: Column<MvpRow>[] = [
  { key: "mvp", head: "MVP", title: "MVP score", value: (r) => r.mvp, show: (r) => r.mvp.toFixed(2) },
  { key: "matches", head: "M", title: "Matches played", value: (r) => r.matches },
  { key: "runs", head: "Runs", title: "Runs scored", value: (r) => r.runs },
  { key: "given", head: "Given", title: "Runs given", value: (r) => r.given },
  { key: "outs", head: "Outs", title: "Times out", value: (r) => r.outs, show: (r) => r.outs || "–" },
  { key: "wickets", head: "Wkts", title: "Wickets", value: (r) => r.wickets, show: (r) => r.wickets || "–" },
  { key: "extras", head: "Extras", title: "Extras given: no-balls, wides and dead balls", value: (r) => r.extras, show: (r) => r.extras || "–" },
];

async function Mvp({ searchParams }: { searchParams: PageProps<"/admin/mvp">["searchParams"] }) {
  await requireOrganiser();
  const { view, column } = viewFrom(await searchParams, COLUMNS, USUAL);
  await connection();
  const { mvp: everyone, matches } = await getPlayerStats();
  const ranked = rankBy(everyone.filter(inGender(view.gender)), column, (a, b) => b.mvp - a.mvp || b.runs - a.runs);

  return (
    <div className="space-y-6">
      <div>
        <LeaderNav current="mvp" />
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">MVP</h1>
        <p className="mt-1 text-sm text-muted">
          Most valuable player, from each player&apos;s batting and bowling in all {matches} match{matches === 1 ? "" : "es"} played so far.
          Organisers only: player names aren&apos;t public.
        </p>
        <p className="mt-2 rounded-md border border-line bg-soft px-3 py-2 text-sm">
          <span className="font-medium">MVP</span> = (runs scored − runs given + 5 × wickets − 5 × outs − extras) ÷ matches played.
          <span className="mt-1 block text-xs text-muted">
            Extras are the no-balls, wides and dead balls a player bowled, counted. Runs given already include the runs those cost. A match counts
            as played if the player batted or bowled in it. For the 10 Oct matches (16 to 22), who faced each ball is a best estimate from the
            scoreboards.
          </span>
        </p>
      </div>

      <div className="space-y-3">
        <GenderChips view={view} href="/admin/mvp" />
        <SearchForm view={view} href="/admin/mvp" placeholder="Search a player or team" />
      </div>

      {everyone.length === 0 ? (
        <p className="text-sm text-muted">No player figures yet.</p>
      ) : (
        <LeaderTable
          who="Player"
          columns={COLUMNS}
          sorted={column}
          usual={USUAL}
          rows={ranked.filter(matching(view.q))}
          view={view}
          href="/admin/mvp"
          empty={`No player or team matches “${view.q}”.`}
        />
      )}
    </div>
  );
}
