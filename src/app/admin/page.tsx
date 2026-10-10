import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { GroupBadge, PastToggle } from "@/components/cricket";
import { requireOrganiser } from "@/lib/auth";
import { getTournament, type MatchView } from "@/lib/data";
import { prisma } from "@/lib/db";
import { dayKey, formatLongDay, formatTime } from "@/lib/format";
import { logout } from "./actions";

export const metadata: Metadata = { title: "Organisers", robots: { index: false } };

export default function AdminPage(props: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Dashboard searchParams={props.searchParams} />
    </Suspense>
  );
}

const STATUS_CHIP: Record<MatchView["status"], string> = {
  SCHEDULED: "",
  COMPLETED: "",
  WALKOVER: "Walkover",
  ABANDONED: "Abandoned",
  DOUBLE_FORFEIT: "Both forfeited",
  POSTPONED: "Postponed",
};

/** "Live · Ciril" while a match is being scored; "scored by Ciril" once submitted from the scorer. */
function ScoringTag({ info }: { info?: { submitted: boolean; by: string | null } }) {
  if (!info) return null;
  if (info.submitted) return <span>· scored by {info.by ?? "unknown"}</span>;
  return <span className="rounded bg-cricket-tint px-1.5 py-0.5 font-medium text-accent">Live · {info.by ?? "scorer"}</span>;
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const organiser = await requireOrganiser();
  const showPast = (await searchParams).past === "1";
  await connection();
  const { matches } = await getTournament();
  const today = dayKey(new Date().toISOString());

  // Past match days (before today, UAE) are hidden unless asked for; today's stay for late results.
  const pastCount = matches.filter((m) => dayKey(m.startsAt) < today).length;
  const days = new Map<string, MatchView[]>();
  for (const m of matches) {
    const key = dayKey(m.startsAt);
    if (!showPast && key < today) continue;
    days.set(key, [...(days.get(key) ?? []), m]);
  }
  const firstOpenDay = showPast ? [...days.keys()].find((k) => k >= today) : undefined;

  // Who is scoring (or scored) each match live: the last login to send balls from the scorer.
  const sessions = await prisma.scoringSession.findMany({
    select: { submitted: true, match: { select: { matchNo: true } }, updatedBy: { select: { name: true } } },
  });
  const scoring = new Map(sessions.map((s) => [s.match.matchNo, { submitted: s.submitted, by: s.updatedBy?.name ?? null }]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">Results</h1>
          <p className="mt-1 text-sm text-muted">Signed in as {organiser.name}. Every change is logged with your name.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/fixtures" className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted">
            Fixtures &amp; delays
          </Link>
          <Link href="/admin/contacts" className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted">
            Team contacts
          </Link>
          {organiser.role === "admin" && (
            <Link href="/admin/users" className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted">
              Logins
            </Link>
          )}
          <form action={logout}>
            <button className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted">Sign out</button>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PastToggle showPast={showPast} pastCount={pastCount} href={showPast ? "/admin" : "/admin?past=1"} />
        {firstOpenDay && (
          <a href={`#day-${firstOpenDay}`} className="text-sm underline underline-offset-2">
            Jump to next match day
          </a>
        )}
      </div>
      {days.size === 0 && <p className="text-sm text-muted">No more matches to come.</p>}

      {[...days.entries()].map(([key, list]) => (
        <section key={key} id={`day-${key}`} className="scroll-mt-4">
          <h2 className="mb-2 font-display text-xl font-semibold leading-none">{formatLongDay(list[0].startsAt)}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card shadow-sm">
            {list.map((m) => (
              <li key={m.matchNo} id={`match-${m.matchNo}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    {m.group && <GroupBadge group={m.group} />}
                    {m.label} · {formatTime(m.startsAt)}
                    {STATUS_CHIP[m.status] && (
                      <span className="rounded bg-warn-tint px-1.5 py-0.5 font-medium text-warn">{STATUS_CHIP[m.status]}</span>
                    )}
                    <ScoringTag info={scoring.get(m.matchNo)} />
                  </div>
                  <div className="mt-1 truncate">
                    {m.homeLabel}
                    {m.status === "COMPLETED" ? (
                      <span className="tabular mx-1.5 font-display text-lg font-semibold">
                        {m.score1}–{m.score2}
                      </span>
                    ) : (
                      <span className="mx-1.5 text-muted">v</span>
                    )}
                    {m.awayLabel}
                  </div>
                </div>
                <div className="flex gap-2">
                  {m.home && m.away && !m.finished && (
                    <Link href={`/score/${m.matchNo}`} className="rounded-md border border-line px-3 py-1.5 hover:border-muted">
                      Score live
                    </Link>
                  )}
                  <Link href={`/admin/match/${m.matchNo}`} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent-hover">
                    {m.finished ? "Edit" : "Enter result"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
