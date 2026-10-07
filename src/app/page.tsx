import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { MatchDays, QualifyKey, SectionTitle, StandingsTable, StatCard } from "@/components/cricket";
import { getTournament, type Tournament } from "@/lib/data";
import { dayKey, formatLongDay, formatStamp } from "@/lib/format";
import { GROUPS } from "@/lib/tournament";

export default async function HomePage() {
  const tournament = await getTournament();
  const played = tournament.matches.filter((m) => m.status === "COMPLETED").length;
  const firstKnockout = tournament.matches.find((m) => m.stage !== "GROUP");

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-3xl font-semibold leading-none sm:text-4xl">Cricket 2026</h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="Teams" value={tournament.teams.length} detail={`${GROUPS.length} groups · top 2 go through`} />
          <StatCard
            label="Matches played"
            value={
              <>
                {played}
                <span className="text-lg font-medium text-muted"> / {tournament.matches.length}</span>
              </>
            }
            progress={tournament.matches.length ? played / tournament.matches.length : 0}
            detail={tournament.lastUpdated ? `Updated ${formatStamp(tournament.lastUpdated)}` : undefined}
          />
          {firstKnockout && (
            <StatCard
              label="Knockouts start"
              value={<span className="text-xl">{formatLongDay(firstKnockout.startsAt)}</span>}
              detail="Quarter-finals, then semis and the final"
            />
          )}
        </div>
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
