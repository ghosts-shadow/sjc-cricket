import type { Metadata } from "next";
import { MatchCard } from "@/components/cricket";
import { getTournament } from "@/lib/data";

export const metadata: Metadata = { title: "Knockouts" };

const ROUNDS = [
  { stage: "QF", title: "Quarter-finals" },
  { stage: "SF", title: "Semi-finals" },
  { stage: "FINAL", title: "Final" },
  { stage: "THIRD", title: "3rd place" },
] as const;

export default async function BracketPage() {
  const { matches } = await getTournament();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-bold leading-none sm:text-5xl">Knockouts</h1>
        <p className="mt-1 text-sm text-muted">
          Group winners and runners-up fill in automatically once each group&apos;s matches are complete. A tie is
          decided by a super over.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-4">
        {ROUNDS.map((round) => (
          <section key={round.stage}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-muted">{round.title}</h2>
            <div className="space-y-2">
              {matches
                .filter((m) => m.stage === round.stage)
                .map((m) => (
                  <MatchCard key={m.matchNo} match={m} showDate />
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
