import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireOrganiser } from "@/lib/auth";
import { getTournamentLive } from "@/lib/data";
import { formatDay, formatLongDay, formatTime, isPastDay, timeChangeText, toDubaiInputs } from "@/lib/format";
import { FixtureForm, SwapForm } from "./fixture-form";

export const metadata: Metadata = { title: "Edit fixture", robots: { index: false } };

export default function FixtureAdminPage(props: PageProps<"/admin/fixtures/[matchNo]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <FixtureAdmin params={props.params} />
    </Suspense>
  );
}

async function FixtureAdmin({ params }: { params: PageProps<"/admin/fixtures/[matchNo]">["params"] }) {
  await requireOrganiser();
  const matchNo = Number((await params).matchNo);
  await connection();
  const { matches, teams } = await getTournamentLive();
  const match = matches.find((m) => m.matchNo === matchNo);
  if (!match) notFound();
  const backHref = `/admin/fixtures${isPastDay(match.startsAt) ? "?past=1" : ""}#match-${matchNo}`;

  const unplayed = (status: string) => status === "SCHEDULED" || status === "POSTPONED";
  const swapOptions = matches
    .filter((m) => m.matchNo !== matchNo && unplayed(m.status))
    .map((m) => ({
      matchNo: m.matchNo,
      label: `Match ${m.matchNo} · ${formatDay(m.startsAt)} ${formatTime(m.startsAt)} · ${m.homeLabel} v ${m.awayLabel}`,
    }));
  const moved = timeChangeText(match.startsAt, match.originalStartsAt);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href={backHref} className="text-sm underline underline-offset-2">
          ← Fixtures &amp; delays
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">{match.label}</h1>
        <p className="mt-1 text-sm text-muted">
          {match.homeLabel} v {match.awayLabel} · {formatLongDay(match.startsAt)} · {formatTime(match.startsAt)}
        </p>
        {moved && <p className="mt-1 text-sm text-warn">{moved}</p>}
      </div>

      <FixtureForm
        matchNo={matchNo}
        groupTeams={match.stage === "GROUP" ? teams.filter((t) => t.group === match.group).map((t) => ({ id: t.id, name: t.name })) : null}
        teamsLocked={!unplayed(match.status)}
        initial={{
          ...toDubaiInputs(match.startsAt),
          team1Id: match.home?.id ?? null,
          team2Id: match.away?.id ?? null,
          note: match.note ?? "",
        }}
      />

      {unplayed(match.status) && <SwapForm matchNo={matchNo} options={swapOptions} />}

      {match.stage !== "GROUP" && (
        <p className="text-xs text-muted">
          Knockout teams fill in from the group tables. To correct them, use the{" "}
          <Link href={`/admin/match/${matchNo}`} className="underline underline-offset-2">
            result page
          </Link>
          .
        </p>
      )}
    </div>
  );
}
