import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireOrganiser } from "@/lib/auth";
import { getTournament } from "@/lib/data";
import { prisma } from "@/lib/db";
import { formatLongDay, formatStamp, formatTime, toDubaiInputs } from "@/lib/format";
import { ResultForm } from "./result-form";

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
  const { matches, teams } = await getTournament();
  const match = matches.find((m) => m.matchNo === matchNo);
  if (!match) notFound();

  const history = await prisma.auditLog.findMany({
    where: { matchId: match.id },
    include: { organiser: { select: { name: true } } },
    orderBy: { at: "desc" },
    take: 10,
  });
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const describe = (s: unknown) => {
    const v = s as { status: string; score1: number | null; score2: number | null; winnerId: number | null };
    const score = v.score1 != null ? ` ${v.score1}–${v.score2}` : "";
    const winner = v.winnerId != null ? ` (${teamName.get(v.winnerId)})` : "";
    return `${v.status.toLowerCase().replace("_", " ")}${score}${winner}`;
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href={`/admin#match-${matchNo}`} className="text-sm underline underline-offset-2">
          ← All matches
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">{match.label}</h1>
        <p className="mt-1 text-sm text-muted">
          {formatLongDay(match.startsAt)} · {formatTime(match.startsAt)}
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
          ...toDubaiInputs(match.startsAt),
        }}
      />

      {history.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-muted">Change history</h2>
          <ul className="space-y-1 text-xs text-muted">
            {history.map((h) => (
              <li key={h.id}>
                {formatStamp(h.at.toISOString())} · {h.organiser.name}: {describe(h.before)} → {describe(h.after)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
