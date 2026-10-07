import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { GroupBadge } from "@/components/cricket";
import { requireOrganiser } from "@/lib/auth";
import { getTournament, type MatchView } from "@/lib/data";
import { dayKey, formatLongDay, formatTime } from "@/lib/format";
import { logout } from "./actions";

export const metadata: Metadata = { title: "Organisers", robots: { index: false } };

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Dashboard />
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

async function Dashboard() {
  const organiser = await requireOrganiser();
  await connection();
  const { matches } = await getTournament();
  const today = dayKey(new Date().toISOString());

  const days = new Map<string, MatchView[]>();
  for (const m of matches) days.set(dayKey(m.startsAt), [...(days.get(dayKey(m.startsAt)) ?? []), m]);
  const firstOpenDay = [...days.keys()].find((k) => k >= today);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold leading-none sm:text-5xl">Results</h1>
          <p className="mt-1 text-sm text-muted">Signed in as {organiser.name}. Every change is logged with your name.</p>
        </div>
        <form action={logout}>
          <button className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted">Sign out</button>
        </form>
      </div>

      {firstOpenDay && (
        <a href={`#day-${firstOpenDay}`} className="inline-block text-sm underline underline-offset-2">
          Jump to next match day
        </a>
      )}

      {[...days.entries()].map(([key, list]) => (
        <section key={key} id={`day-${key}`} className="scroll-mt-4">
          <h2 className="mb-2 font-display text-xl font-bold leading-none">{formatLongDay(list[0].startsAt)}</h2>
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
                  </div>
                  <div className="mt-1 truncate">
                    {m.homeLabel}
                    {m.status === "COMPLETED" ? (
                      <span className="tabular mx-1.5 font-display text-lg font-bold">
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
                  <Link href={`/admin/match/${m.matchNo}`} className="rounded-md bg-foreground px-3 py-1.5 font-medium text-card">
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
