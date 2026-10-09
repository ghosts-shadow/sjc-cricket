import Link from "next/link";
import type { MatchView } from "@/lib/data";
import { dayKey, formatDay, formatLongDay, formatTime, timeChangeText } from "@/lib/format";
import { formatNrr, QUALIFIERS_PER_GROUP, type StandingRow, type TeamLite } from "@/lib/tournament";

const GROUP_COLOURS: Record<string, string> = {
  A: "bg-group-a-tint text-group-a",
  B: "bg-group-b-tint text-group-b",
  C: "bg-group-c-tint text-group-c",
  D: "bg-group-d-tint text-group-d",
};

export function GroupBadge({ group }: { group: string }) {
  return (
    <span
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[11px] font-semibold ${GROUP_COLOURS[group] ?? "bg-soft text-muted"}`}
    >
      {group}
    </span>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="font-display text-2xl font-semibold leading-none">{children}</h2>
      {aside && <div className="text-sm text-muted">{aside}</div>}
    </div>
  );
}

/** Headline number card. `progress` (0–1) draws a thin bar under the value. */
export function StatCard({ label, value, detail, progress }: { label: string; value: React.ReactNode; detail?: React.ReactNode; progress?: number }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-sm">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="tabular mt-2 font-display text-3xl font-semibold leading-none">{value}</p>
      {progress != null && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-raised">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {detail && <p className="mt-2 text-xs text-muted">{detail}</p>}
    </div>
  );
}

function TeamName({ team, fallback, bold }: { team: TeamLite | null; fallback: string; bold: boolean }) {
  if (!team) return <span className="italic text-muted">{fallback}</span>;
  return (
    <Link href={`/teams/${team.slug}`} className={`hover:underline ${bold ? "font-semibold" : ""}`}>
      {team.name}
    </Link>
  );
}

const STATUS_TEXT: Partial<Record<MatchView["status"], string>> = {
  WALKOVER: "Walkover",
  ABANDONED: "Abandoned · 1 point each",
  DOUBLE_FORFEIT: "Forfeited by both teams",
  POSTPONED: "Postponed",
};

function resultLine(m: MatchView): string | null {
  if (m.status === "COMPLETED" && m.score1 != null && m.score2 != null) {
    if (m.score1 === m.score2) {
      return m.stage === "GROUP" ? "Draw · 1 point each" : m.winner ? `${m.winner.name} won the super over` : "Tied";
    }
    if (m.winner) return `${m.winner.name} won by ${Math.abs(m.score1 - m.score2)} runs`;
  }
  if (m.status === "WALKOVER" && m.winner) return `${m.winner.name} won by walkover`;
  return STATUS_TEXT[m.status] ?? null;
}

export function MatchCard({ match, showDate = false }: { match: MatchView; showDate?: boolean }) {
  const played = match.status === "COMPLETED";
  const homeWon = match.winner != null && match.winner.id === match.home?.id;
  const awayWon = match.winner != null && match.winner.id === match.away?.id;
  const line = resultLine(match);
  const moved = match.finished ? null : timeChangeText(match.startsAt, match.originalStartsAt);
  const footer = [moved, line, match.note].filter(Boolean).join(" · ");

  return (
    <article className="rounded-lg border border-line bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          {match.group && <GroupBadge group={match.group} />}
          <span>{match.label}</span>
        </span>
        <span className="tabular font-display text-base font-semibold text-foreground">
          {showDate && <span className="font-medium text-muted">{formatDay(match.startsAt)} · </span>}
          {formatTime(match.startsAt)}
        </span>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-3">
          <TeamName team={match.home} fallback={match.homeLabel} bold={homeWon} />
          {played && <span className={`tabular font-display text-xl leading-none ${homeWon ? "font-semibold" : "font-medium text-muted"}`}>{match.score1}</span>}
        </div>
        <div className="flex items-center justify-between gap-3">
          <TeamName team={match.away} fallback={match.awayLabel} bold={awayWon} />
          {played && <span className={`tabular font-display text-xl leading-none ${awayWon ? "font-semibold" : "font-medium text-muted"}`}>{match.score2}</span>}
        </div>
      </div>
      {footer && (
        <p className="mt-2 border-t border-line pt-2 text-xs text-muted">
          {moved && <span className="font-medium text-warn">{moved}</span>}
          {moved && footer !== moved && " · "}
          {[line, match.note].filter(Boolean).join(" · ")}
        </p>
      )}
    </article>
  );
}

/** Matches grouped under a heading per day (UAE time). */
export function MatchDays({ matches, emptyText = "No matches." }: { matches: MatchView[]; emptyText?: string }) {
  if (matches.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  const days = new Map<string, MatchView[]>();
  for (const m of matches) {
    const key = dayKey(m.startsAt);
    days.set(key, [...(days.get(key) ?? []), m]);
  }
  return (
    <div className="space-y-6">
      {[...days.entries()].map(([key, list]) => (
        <section key={key} id={`day-${key}`}>
          <h3 className="mb-2 font-display text-xl font-semibold leading-none">{formatLongDay(list[0].startsAt)}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((m) => (
              <MatchCard key={m.matchNo} match={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function StandingsTable({ group, rows, compact = false }: { group: string; rows: StandingRow[]; compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-line bg-soft px-3 py-2">
        <GroupBadge group={group} />
        <h3 className="font-display text-lg font-semibold leading-none">Group {group}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="tabular w-full text-sm">
          <thead className="text-[11px] uppercase tracking-[.1em] text-muted">
            <tr className="border-b border-line">
              <th className="w-8 px-2 py-1.5 text-left font-semibold">#</th>
              <th className="px-2 py-1.5 text-left font-semibold">Team</th>
              <th className="px-1.5 py-1.5 text-right font-semibold" title="Played">P</th>
              {!compact && (
                <>
                  <th className="px-1.5 py-1.5 text-right font-semibold" title="Won">W</th>
                  <th className="px-1.5 py-1.5 text-right font-semibold" title="Lost">L</th>
                  <th className="hidden px-1.5 py-1.5 text-right font-semibold sm:table-cell" title="Drawn / no result">D</th>
                  <th className="hidden px-1.5 py-1.5 text-right font-semibold sm:table-cell" title="Runs scored">RS</th>
                  <th className="hidden px-1.5 py-1.5 text-right font-semibold sm:table-cell" title="Runs against">RA</th>
                </>
              )}
              <th className="px-1.5 py-1.5 text-right font-semibold" title="Run difference: runs scored minus runs conceded">RR</th>
              <th className="px-1.5 py-1.5 text-right font-semibold" title="Run difference per match">NRR</th>
              <th className="px-2 py-1.5 text-right font-semibold text-foreground">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.team.id}
                className={`border-b border-line last:border-0 ${i < QUALIFIERS_PER_GROUP ? "bg-qualify" : ""}`}
              >
                <td className="px-2 py-1.5 text-muted">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <Link href={`/teams/${row.team.slug}`} className="font-medium hover:underline">
                    {row.team.name}
                  </Link>
                </td>
                <td className="px-1.5 py-1.5 text-right">{row.played}</td>
                {!compact && (
                  <>
                    <td className="px-1.5 py-1.5 text-right">{row.won}</td>
                    <td className="px-1.5 py-1.5 text-right">{row.lost}</td>
                    <td className="hidden px-1.5 py-1.5 text-right sm:table-cell">{row.drawn + row.noResult}</td>
                    <td className="hidden px-1.5 py-1.5 text-right sm:table-cell">{row.runsFor}</td>
                    <td className="hidden px-1.5 py-1.5 text-right sm:table-cell">{row.runsAgainst}</td>
                  </>
                )}
                <td className="px-1.5 py-1.5 text-right text-muted">{row.played ? formatNrr(row.runDiff) : "–"}</td>
                <td className="px-1.5 py-1.5 text-right text-muted">{formatNrr(row.nrr)}</td>
                <td className="px-2 py-1.5 text-right font-display text-lg font-semibold leading-none">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** "Show past matches (12)" / "Hide past matches". Past = match days before today, UAE time. */
export function PastToggle({ showPast, pastCount, href }: { showPast: boolean; pastCount: number; href: string }) {
  if (pastCount === 0) return null;
  return (
    <Link href={href} scroll={false} className="inline-flex items-center rounded-full border border-line px-3 py-1 text-sm text-muted hover:text-foreground">
      {showPast ? "Hide past matches" : `Show past matches (${pastCount})`}
    </Link>
  );
}

export function QualifyKey() {
  return (
    <p className="flex items-center gap-2 text-xs text-muted">
      <span className="inline-block h-3 w-3 rounded-sm border border-line bg-qualify" />
      Top 2 in each group reach the quarter-finals. Ranked by points, then NRR (run difference per match).
    </p>
  );
}
