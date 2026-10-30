import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { matches as matching, Panel, rank, SearchForm } from "@/components/leaderboard";
import { requireOrganiser } from "@/lib/auth";
import { getBowlingStats, type BowlingRow } from "@/lib/stats";

export const metadata: Metadata = { title: "Bowling", robots: { index: false } };

export default function BowlingPage(props: PageProps<"/admin/bowling">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Bowling searchParams={props.searchParams} />
    </Suspense>
  );
}

/** Economy needs a few overs, or one cheap over tops the list (each bowler bowls one over a match). */
const ECONOMY_MIN_OVERS = 2;

const economy = (r: BowlingRow) => r.runs / r.overs;

async function Bowling({ searchParams }: { searchParams: PageProps<"/admin/bowling">["searchParams"] }) {
  await requireOrganiser();
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").trim().slice(0, 40);
  await connection();
  const { rows, matches } = await getBowlingStats();

  const byWickets = rank(
    rows.filter((r) => r.wickets > 0),
    (a, b) => b.wickets - a.wickets || a.runs - b.runs,
  );
  const byEconomy = rank(
    rows.filter((r) => r.overs >= ECONOMY_MIN_OVERS),
    (a, b) => economy(a) - economy(b) || b.wickets - a.wickets,
  );
  const byExtras = rank(
    rows.filter((r) => r.wides + r.noBalls > 0),
    (a, b) => b.wides + b.noBalls - (a.wides + a.noBalls) || b.wides - a.wides,
  );
  const byRuns = rank(rows, (a, b) => b.runs - a.runs || a.overs - b.overs);
  const match = matching(q);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap gap-x-4 text-sm">
          <Link href="/admin" className="underline underline-offset-2">
            ← Results
          </Link>
          <Link href="/admin/batting" className="underline underline-offset-2">
            Batting →
          </Link>
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">Bowling</h1>
        <p className="mt-1 text-sm text-muted">
          Every bowler&apos;s figures, from {matches} match{matches === 1 ? "" : "es"} scored live with the bowler entered for each over. Runs
          conceded include wides, no-balls and penalty runs; every wicket in a bowler&apos;s over counts as theirs, run outs included. Organisers
          only: player names aren&apos;t public.
        </p>
      </div>

      <SearchForm q={q} href="/admin/bowling" placeholder="Search a bowler or team" />

      {rows.length === 0 ? (
        <p className="text-sm text-muted">No bowling figures yet.</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Panel
            title="Wickets"
            who="Bowler"
            empty={q ? `No wickets for “${q}”.` : "No wickets yet."}
            head={["Ov", "W", "R", "Net"]}
            titles={["Overs bowled", "Wickets (−5 each)", "Runs conceded", "What the overs added: runs minus 5 per wicket"]}
            rows={byWickets.filter(match)}
            cells={(r) => [r.overs, r.wickets, r.runs, r.net]}
            strong={1}
          />
          <Panel
            title="Economy"
            who="Bowler"
            note={`Runs conceded per over. Bowlers with ${ECONOMY_MIN_OVERS}+ overs.`}
            empty={q ? `No bowler with ${ECONOMY_MIN_OVERS}+ overs matches “${q}”.` : `Nobody has bowled ${ECONOMY_MIN_OVERS} overs yet.`}
            head={["Ov", "Econ", "R", "W"]}
            titles={["Overs bowled", "Runs conceded per over", "Runs conceded", "Wickets"]}
            rows={byEconomy.filter(match)}
            cells={(r) => [r.overs, economy(r).toFixed(1), r.runs, r.wickets || "–"]}
            strong={1}
          />
          <Panel
            title="Extras"
            who="Bowler"
            note="Wides and no-balls bowled. Dead balls shown too."
            empty={q ? `No extras for “${q}”.` : "No extras yet."}
            head={["Wd", "Nb", "Db", "Ov"]}
            titles={["Wides", "No-balls", "Dead balls", "Overs bowled"]}
            rows={byExtras.filter(match)}
            cells={(r) => [r.wides || "–", r.noBalls || "–", r.deadBalls || "–", r.overs]}
            strong={0}
          />
          <Panel
            title="Runs conceded"
            who="Bowler"
            empty={q ? `No bowler or team matches “${q}”.` : "No overs yet."}
            head={["R", "Ov", "W", "Net"]}
            titles={["Runs conceded", "Overs bowled", "Wickets", "Runs minus 5 per wicket"]}
            rows={byRuns.filter(match)}
            cells={(r) => [r.runs, r.overs, r.wickets || "–", r.net]}
            strong={0}
          />
        </div>
      )}
    </div>
  );
}
