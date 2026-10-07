import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { MatchDays, QualifyKey, SectionTitle, StandingsTable } from "@/components/cricket";
import { getTournament, type Tournament } from "@/lib/data";
import { dayKey, formatStamp } from "@/lib/format";
import { GROUPS } from "@/lib/tournament";

export default async function HomePage() {
  const tournament = await getTournament();
  const played = tournament.matches.filter((m) => m.status === "COMPLETED").length;

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-4xl font-bold leading-none sm:text-5xl">Cricket 2026</h1>
        <p className="mt-1 text-sm text-muted">
          21 teams · 4 groups · {played} of {tournament.matches.length} matches played
          {tournament.lastUpdated && <> · Updated {formatStamp(tournament.lastUpdated)}</>}
        </p>
      </section>

      <Suspense fallback={<p className="text-sm text-muted">Loading fixtures…</p>}>
        <UpNext tournament={tournament} />
      </Suspense>

      <section>
        <SectionTitle
          aside={
            <Link href="/standings" className="underline underline-offset-2">
              Full tables
            </Link>
          }
        >
          Standings
        </SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          {GROUPS.map((g) => (
            <StandingsTable key={g} group={g} rows={tournament.standings[g]} compact />
          ))}
        </div>
        <div className="mt-3">
          <QualifyKey />
        </div>
      </section>
    </div>
  );
}

/** Next match day and the latest results, relative to today in the UAE. */
async function UpNext({ tournament }: { tournament: Tournament }) {
  await connection();
  const today = dayKey(new Date().toISOString());

  const upcoming = tournament.matches.filter((m) => dayKey(m.startsAt) >= today && m.status !== "POSTPONED");
  const nextDay = upcoming.find((m) => !m.finished) ?? upcoming[0];
  const nextKey = nextDay ? dayKey(nextDay.startsAt) : null;

  const finished = tournament.matches.filter((m) => m.finished && dayKey(m.startsAt) !== nextKey);
  const lastKey = finished.length ? dayKey(finished[finished.length - 1].startsAt) : null;

  return (
    <>
      <section>
        <SectionTitle aside={nextKey === today ? "Today" : undefined}>Next up</SectionTitle>
        <MatchDays
          matches={nextKey ? tournament.matches.filter((m) => dayKey(m.startsAt) === nextKey) : []}
          emptyText="No more matches scheduled."
        />
      </section>
      {lastKey && (
        <section>
          <SectionTitle
            aside={
              <Link href="/fixtures" className="underline underline-offset-2">
                All fixtures
              </Link>
            }
          >
            Latest results
          </SectionTitle>
          <MatchDays matches={finished.filter((m) => dayKey(m.startsAt) === lastKey)} />
        </section>
      )}
    </>
  );
}
