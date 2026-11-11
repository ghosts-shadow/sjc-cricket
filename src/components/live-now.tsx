import { connection } from "next/server";
import { AutoRefresh } from "@/components/auto-refresh";
import { LiveCard, SectionTitle } from "@/components/cricket";
import { getLiveScores, type MatchView } from "@/lib/data";
import { dayKey } from "@/lib/format";

/**
 * The matches being scored right now, an over behind the play (see live.ts). Shows nothing when
 * nothing is live. On a match day it keeps the page refreshing, so the section appears and moves on
 * by itself: every 20 seconds while a match is live, every minute while waiting for one to start.
 */
export async function LiveNow({ matches }: { matches: MatchView[] }) {
  await connection();
  const scores = await getLiveScores();
  const live = scores.flatMap((score) => {
    const match = matches.find((m) => m.matchNo === score.matchNo);
    return match && !match.finished ? [{ match, score }] : [];
  });

  if (live.length === 0) {
    const today = dayKey(new Date().toISOString());
    const playingToday = matches.some((m) => dayKey(m.startsAt) === today && m.status === "SCHEDULED");
    return playingToday ? <AutoRefresh seconds={60} /> : null;
  }

  return (
    <section>
      <SectionTitle aside="One over behind the play">Live</SectionTitle>
      <div className="grid gap-2 sm:grid-cols-2">
        {live.map(({ match, score }) => (
          <LiveCard key={match.matchNo} match={match} score={score} />
        ))}
      </div>
      <AutoRefresh seconds={20} />
    </section>
  );
}
