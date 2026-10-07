import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { GroupBadge } from "@/components/cricket";
import { requireOrganiser } from "@/lib/auth";
import { getTournament, type MatchView } from "@/lib/data";
import { dayKey, formatLongDay, formatTime, timeChangeText } from "@/lib/format";
import { DelayForm, type DelayDay } from "./delay-form";

export const metadata: Metadata = { title: "Fixtures & delays", robots: { index: false } };

export default function FixturesAdminPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <FixturesAdmin />
    </Suspense>
  );
}

const matchup = (m: MatchView) => `${m.homeLabel} v ${m.awayLabel}`;

async function FixturesAdmin() {
  await requireOrganiser();
  await connection();
  const { matches } = await getTournament();
  const today = dayKey(new Date().toISOString());

  // Days from today on that still have unplayed matches, for the delay form.
  const delayDays = new Map<string, DelayDay>();
  for (const m of matches) {
    const key = dayKey(m.startsAt);
    if (key < today || m.status !== "SCHEDULED") continue;
    const day = delayDays.get(key) ?? { key, label: formatLongDay(m.startsAt), matches: [] };
    day.matches.push({ matchNo: m.matchNo, label: `Match ${m.matchNo} · ${formatTime(m.startsAt)} · ${matchup(m)}` });
    delayDays.set(key, day);
  }

  const byDay = new Map<string, MatchView[]>();
  for (const m of matches) byDay.set(dayKey(m.startsAt), [...(byDay.get(dayKey(m.startsAt)) ?? []), m]);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-xs text-muted underline underline-offset-2">
          ← All matches
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">Fixtures &amp; delays</h1>
        <p className="mt-1 text-sm text-muted">Changes show on the public site straight away, with the old time next to the new one.</p>
      </div>

      <section>
        <h2 className="mb-3 font-display text-xl font-semibold">Running late?</h2>
        <DelayForm days={[...delayDays.values()]} />
      </section>

      <section className="space-y-6">
        <h2 className="font-display text-xl font-semibold">All fixtures</h2>
        {[...byDay.entries()].map(([key, list]) => (
          <div key={key} id={`day-${key}`} className="scroll-mt-4">
            <h3 className="mb-2 font-display text-lg font-semibold">{formatLongDay(list[0].startsAt)}</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card shadow-sm">
              {list.map((m) => {
                const moved = timeChangeText(m.startsAt, m.originalStartsAt);
                return (
                  <li key={m.matchNo} id={`match-${m.matchNo}`} className="flex items-center gap-3 p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        {m.group && <GroupBadge group={m.group} />}
                        {m.label} · <span className="tabular font-medium text-foreground">{formatTime(m.startsAt)}</span>
                        {m.status !== "SCHEDULED" && <span className="rounded bg-soft px-1.5 py-0.5">{m.status.toLowerCase().replace("_", " ")}</span>}
                      </p>
                      <p className="mt-1 truncate">{matchup(m)}</p>
                      {moved && <p className="mt-0.5 text-xs text-warn">{moved}</p>}
                    </div>
                    <Link href={`/admin/fixtures/${m.matchNo}`} className="shrink-0 rounded-md border border-line px-3 py-1.5 hover:bg-soft">
                      Edit
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
