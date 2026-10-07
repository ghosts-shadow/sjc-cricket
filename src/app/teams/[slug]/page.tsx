import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GroupBadge, MatchCard, SectionTitle } from "@/components/cricket";
import { getTournament } from "@/lib/data";
import { formatNrr } from "@/lib/tournament";

export async function generateStaticParams() {
  const { teams } = await getTournament();
  return teams.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata(props: PageProps<"/teams/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const { teams } = await getTournament();
  return { title: teams.find((t) => t.slug === slug)?.name ?? "Team" };
}

export default function TeamPage(props: PageProps<"/teams/[slug]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading team…</p>}>
      <Team params={props.params} />
    </Suspense>
  );
}

async function Team({ params }: { params: PageProps<"/teams/[slug]">["params"] }) {
  const { slug } = await params;
  const { teams, matches, standings } = await getTournament();
  const team = teams.find((t) => t.slug === slug);
  if (!team) notFound();

  const table = standings[team.group];
  const position = table.findIndex((r) => r.team.id === team.id);
  const row = table[position];
  const theirs = matches.filter((m) => m.home?.id === team.id || m.away?.id === team.id);
  const results = theirs.filter((m) => m.finished);
  const upcoming = theirs.filter((m) => !m.finished);

  const stats = [
    { label: "Position", value: `${position + 1} of ${table.length}` },
    { label: "Points", value: row.points },
    { label: "W-L-D", value: `${row.won}-${row.lost}-${row.drawn + row.noResult}` },
    { label: "NRR", value: formatNrr(row.nrr) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="flex items-center gap-2 text-sm text-muted">
          <GroupBadge group={team.group} /> Group {team.group}
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold leading-tight sm:text-4xl">{team.name}</h1>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-line bg-card p-3 shadow-sm">
            <dt className="text-xs text-muted">{s.label}</dt>
            <dd className="tabular mt-1 font-display text-3xl font-semibold leading-none">{s.value}</dd>
          </div>
        ))}
      </dl>

      <section>
        <SectionTitle>Upcoming</SectionTitle>
        {upcoming.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {upcoming.map((m) => (
              <MatchCard key={m.matchNo} match={m} showDate />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No more group fixtures. Knockout places are decided after the group stage.</p>
        )}
      </section>

      <section>
        <SectionTitle>Results</SectionTitle>
        {results.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {results.map((m) => (
              <MatchCard key={m.matchNo} match={m} showDate />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No results yet.</p>
        )}
      </section>
    </div>
  );
}
