import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireOrganiser } from "@/lib/auth";
import { getTournament } from "@/lib/data";
import { prisma } from "@/lib/db";
import { parseEvents, parseSetup } from "@/lib/scoring";
import { Scorer } from "./scorer";

export const metadata: Metadata = { title: "Live scoring", robots: { index: false } };

export default function ScorePage(props: PageProps<"/score/[matchNo]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <ScoreLoader params={props.params} />
    </Suspense>
  );
}

async function ScoreLoader({ params }: { params: PageProps<"/score/[matchNo]">["params"] }) {
  await requireOrganiser();
  const matchNo = Number((await params).matchNo);
  const { matches } = await getTournament();
  const match = matches.find((m) => m.matchNo === matchNo);
  if (!match) notFound();

  if (!match.home || !match.away) {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-semibold">{match.label}</h1>
        <p className="text-sm text-muted">The teams for this match aren&apos;t decided yet.</p>
        <Link href="/admin" className="text-sm underline underline-offset-2">
          ← All matches
        </Link>
      </div>
    );
  }

  const session = await prisma.scoringSession.findUnique({ where: { matchId: match.id } });
  return (
    <Scorer
      matchNo={match.matchNo}
      label={match.label}
      team1={match.home.name}
      team2={match.away.name}
      knockout={match.stage !== "GROUP"}
      initial={{
        setup: session ? parseSetup(session.setup) : null,
        events: (session && parseEvents(session.events)) || [],
        submitted: session?.submitted ?? false,
        updatedAt: session?.updatedAt.toISOString() ?? null,
      }}
    />
  );
}
