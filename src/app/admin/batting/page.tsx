import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { matches as matching, Panel, rank, SearchForm } from "@/components/leaderboard";
import { requireOrganiser } from "@/lib/auth";
import { getBattingStats } from "@/lib/stats";

export const metadata: Metadata = { title: "Batting", robots: { index: false } };

export default function BattingPage(props: PageProps<"/admin/batting">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Batting searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Batting({ searchParams }: { searchParams: PageProps<"/admin/batting">["searchParams"] }) {
  await requireOrganiser();
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").trim().slice(0, 40);
  await connection();
  const { rows, matches } = await getBattingStats();

  const boundaryRuns = (r: (typeof rows)[number]) => 4 * r.fours + 6 * r.sixes;
  const byRuns = rank(rows, (a, b) => b.runs - a.runs || a.balls - b.balls);
  const byBoundaries = rank(
    rows.filter((r) => r.fours + r.sixes > 0),
    (a, b) => boundaryRuns(b) - boundaryRuns(a) || b.sixes - a.sixes,
  );
  const bySide = rank(
    rows.filter((r) => r.sideRuns > 0),
    (a, b) => b.sideRuns - a.sideRuns || b.runs - a.runs,
  );
  const match = matching(q);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap gap-x-4 text-sm">
          <Link href="/admin" className="underline underline-offset-2">
            ← Results
          </Link>
          <Link href="/admin/bowling" className="underline underline-offset-2">
            Bowling →
          </Link>
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">Batting</h1>
        <p className="mt-1 text-sm text-muted">
          Every batter&apos;s runs, boundaries and side runs, from {matches} match{matches === 1 ? "" : "es"} scored live with a batter on strike.
          Matches scored before 17 Oct only have pair totals, so they aren&apos;t counted here. Organisers only: player names aren&apos;t public.
        </p>
      </div>

      <SearchForm q={q} href="/admin/batting" placeholder="Search a batter or team" />

      {rows.length === 0 ? (
        <p className="text-sm text-muted">No per-batter scores yet. They start with the first match scored live after this update.</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <Panel
            title="Runs"
            who="Batter"
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
            who="Batter"
            note="Back net: 4 on the bounce, 6 on the full or out over the back."
            empty={q ? `No boundaries for “${q}”.` : "No boundaries yet."}
            head={["4s", "6s", "Bdry", "R"]}
            titles={["Back net on the bounce", "Back net on the full, or out over", "Runs from 4s and 6s", "All runs off the bat"]}
            rows={byBoundaries.filter(match)}
            cells={(r) => [r.fours || "–", r.sixes || "–", boundaryRuns(r), r.runs]}
            strong={2}
          />
          <Panel
            title="Side"
            who="Batter"
            note="Side runs: 1–3 off the side nets and posts (2 for out of the court)."
            empty={q ? `No side runs for “${q}”.` : "No side runs yet."}
            head={["Side", "R"]}
            titles={["Side runs: off the side nets and posts", "All runs off the bat"]}
            rows={bySide.filter(match)}
            cells={(r) => [r.sideRuns, r.runs]}
            strong={0}
          />
        </div>
      )}
    </div>
  );
}
