import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { GroupBadge } from "@/components/cricket";
import { requireScorer } from "@/lib/auth";
import { getTournament, type MatchView } from "@/lib/data";
import { dayKey, formatLongDay, formatTime } from "@/lib/format";
import { logout } from "../admin/actions";

export const metadata: Metadata = { title: "Live scoring", robots: { index: false } };

export default function ScoreIndexPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <ScoreIndex />
    </Suspense>
  );
}

/** Scorers' home: today's and upcoming unplayed matches, each with a "Score live" button. */
async function ScoreIndex() {
  const me = await requireScorer();
  await connection();
  const { matches } = await getTournament();
  const today = dayKey(new Date().toISOString());

  const days = new Map<string, MatchView[]>();
  for (const m of matches) {
    const key = dayKey(m.startsAt);
    if (key < today || m.finished || m.status === "POSTPONED") continue;
    days.set(key, [...(days.get(key) ?? []), m]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">Live scoring</h1>
          <p className="mt-1 text-sm text-muted">Signed in as {me.name}. Pick the match you&apos;re scoring.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {me.role === "organiser" && (
            <Link href="/admin" className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted">
              Results
            </Link>
          )}
          <form action={logout}>
            <button className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted">Sign out</button>
          </form>
        </div>
      </div>

      {days.size === 0 && <p className="text-sm text-muted">No matches left to score.</p>}

      {[...days.entries()].map(([key, list]) => (
        <section key={key}>
          <h2 className="mb-2 font-display text-xl font-semibold leading-none">
            {formatLongDay(list[0].startsAt)}
            {key === today && <span className="ml-2 text-sm font-medium text-accent">Today</span>}
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card shadow-sm">
            {list.map((m) => (
              <li key={m.matchNo} className="flex items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    {m.group && <GroupBadge group={m.group} />}
                    {m.label} · <span className="tabular font-medium text-foreground">{formatTime(m.startsAt)}</span>
                  </p>
                  <p className="mt-1 truncate">
                    {m.homeLabel} v {m.awayLabel}
                  </p>
                </div>
                {m.home && m.away ? (
                  <Link href={`/score/${m.matchNo}`} className="shrink-0 rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent-hover">
                    Score live
                  </Link>
                ) : (
                  <span className="shrink-0 text-xs text-muted">Teams not decided</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
