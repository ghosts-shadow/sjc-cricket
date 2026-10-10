import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireOrganiser } from "@/lib/auth";
import { getTournament } from "@/lib/data";
import { prisma } from "@/lib/db";
import { formatDay, formatLongDay, formatStamp, formatTime, isPastDay } from "@/lib/format";
import { parseEvents } from "@/lib/scoring";
import { ResultForm } from "./result-form";
import { ScoringControls } from "./scoring-controls";

export const metadata: Metadata = { title: "Enter result", robots: { index: false } };

export default function MatchAdminPage(props: PageProps<"/admin/match/[matchNo]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <MatchAdmin params={props.params} />
    </Suspense>
  );
}

async function MatchAdmin({ params }: { params: PageProps<"/admin/match/[matchNo]">["params"] }) {
  await requireOrganiser();
  const matchNo = Number((await params).matchNo);
  await connection();
  const { matches, teams } = await getTournament();
  const match = matches.find((m) => m.matchNo === matchNo);
  if (!match) notFound();
  // Past days are hidden on the list by default, so come back to it with them shown.
  const backHref = `/admin${isPastDay(match.startsAt) ? "?past=1" : ""}#match-${matchNo}`;

  const [history, session] = await Promise.all([
    prisma.auditLog.findMany({
      where: { matchId: match.id },
      include: { organiser: { select: { name: true } } },
      orderBy: { at: "desc" },
      take: 10,
    }),
    prisma.scoringSession.findUnique({ where: { matchId: match.id }, include: { updatedBy: { select: { name: true } } } }),
  ]);
  const sessionBalls = session ? (parseEvents(session.events) ?? []).filter((e) => e.type === "ball").length : 0;
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  type Snap = {
    status: string;
    score1: number | null;
    score2: number | null;
    winnerId: number | null;
    team1Id: number | null;
    team2Id: number | null;
    startsAt?: string;
    note?: string | null;
  };
  const describe = (v: Snap) => {
    const score = v.score1 != null ? ` ${v.score1}–${v.score2}` : "";
    const winner = v.winnerId != null ? ` (${teamName.get(v.winnerId)})` : "";
    return `${v.status.toLowerCase().replace("_", " ")}${score}${winner}`;
  };
  const when = (iso: string) => `${formatDay(iso)} ${formatTime(iso)}`;
  const teamsOf = (v: Snap) => `${teamName.get(v.team1Id ?? -1) ?? "TBC"} v ${teamName.get(v.team2Id ?? -1) ?? "TBC"}`;
  /** One line per audit entry, naming only what changed. */
  const describeChange = (action: string, beforeJson: unknown, afterJson: unknown) => {
    if (action === "scorer-reopen") return "reopened live scoring";
    if (action === "scorer-clear") return "cleared live scoring";
    const before = beforeJson as Snap;
    const after = afterJson as Snap;
    const parts: string[] = [];
    if (describe(before) !== describe(after)) parts.push(`${describe(before)} → ${describe(after)}`);
    if (before.startsAt && after.startsAt && before.startsAt !== after.startsAt) parts.push(`time ${when(before.startsAt)} → ${when(after.startsAt)}`);
    if (teamsOf(before) !== teamsOf(after)) parts.push(`teams ${teamsOf(before)} → ${teamsOf(after)}`);
    if ((before.note ?? null) !== (after.note ?? null)) parts.push("note changed");
    return parts.join(" · ") || "saved, no changes";
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href={backHref} className="text-sm underline underline-offset-2">
          ← All matches
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">{match.label}</h1>
        <p className="mt-1 text-sm text-muted">
          {formatLongDay(match.startsAt)} · {formatTime(match.startsAt)} ·{" "}
          <Link href={`/admin/fixtures/${matchNo}`} className="underline underline-offset-2">
            Change time or teams
          </Link>
        </p>
      </div>

      <ResultForm
        matchNo={match.matchNo}
        knockout={match.stage !== "GROUP"}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        initial={{
          status: match.status,
          team1Id: match.home?.id ?? null,
          team2Id: match.away?.id ?? null,
          team1Label: match.homeLabel,
          team2Label: match.awayLabel,
          score1: match.score1,
          score2: match.score2,
          winnerId: match.winnerId,
          note: match.note ?? "",
        }}
      />

      {match.home && match.away && (
        <ScoringControls
          matchNo={matchNo}
          session={
            session
              ? {
                  submitted: session.submitted,
                  balls: sessionBalls,
                  by: session.updatedBy?.name ?? null,
                  at: formatStamp(session.updatedAt.toISOString()),
                }
              : null
          }
        />
      )}

      {history.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-muted">Change history</h2>
          <ul className="space-y-1 text-xs text-muted">
            {history.map((h) => (
              <li key={h.id}>
                {formatStamp(h.at.toISOString())} · {h.organiser.name}: {describeChange(h.action, h.before, h.after)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
