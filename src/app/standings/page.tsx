import type { Metadata } from "next";
import { QualifyKey, StandingsTable } from "@/components/cricket";
import { getTournament } from "@/lib/data";
import { formatStamp } from "@/lib/format";
import { GROUPS } from "@/lib/tournament";

export const metadata: Metadata = { title: "Standings" };

export default async function StandingsPage() {
  const { standings, lastUpdated } = await getTournament();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">Standings</h1>
        {lastUpdated && <p className="mt-1 text-sm text-muted">Updated {formatStamp(lastUpdated)}</p>}
      </div>
      <QualifyKey />
      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <StandingsTable key={g} group={g} rows={standings[g]} />
        ))}
      </div>
      <p className="text-xs text-muted">
        Win 2 points · Draw or abandoned 1 point · Loss 0. Walkover: 2 points to the team that turned up. NRR here is the
        organisers&apos; measure: run difference divided by matches with a scored result.
      </p>
    </div>
  );
}
