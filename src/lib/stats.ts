import "server-only";
import { getTournamentLive } from "./data";
import { prisma } from "./db";
import { playerKey, tally, type PlayedCard, type Tally } from "./leaders";
import { femaleOverPlayers, parseEvents, parseSetup, replay } from "./scoring";

export type { BattingRow, BowlingRow, MvpRow } from "./leaders";

/** Every submitted scoring session, replayed, with the two teams it was between (side 1 = home). */
async function submittedCards(): Promise<PlayedCard[]> {
  const [{ matches }, sessions] = await Promise.all([
    getTournamentLive(),
    prisma.scoringSession.findMany({ where: { submitted: true }, select: { setup: true, events: true, match: { select: { matchNo: true } } } }),
  ]);
  const byNo = new Map(matches.map((m) => [m.matchNo, m]));
  return sessions.flatMap((session) => {
    const view = byNo.get(session.match.matchNo);
    const setup = parseSetup(session.setup);
    const events = parseEvents(session.events);
    if (!view?.home || !view.away || !setup || !events) return [];
    return [{ teams: { 1: view.home, 2: view.away }, card: replay(setup, events) }];
  });
}

/**
 * Submitted cards, plus the players who count as female on the leaderboards: anyone marked F on
 * their team's roster, and anyone who bowled or faced a female over (female bowler to female batter,
 * rules p.5). Most players have no gender saved, so the overs fill the gap. Everyone else is male.
 */
async function cardsAndFemales(): Promise<{ cards: PlayedCard[]; female: Set<string> }> {
  const [cards, flagged] = await Promise.all([
    submittedCards(),
    prisma.player.findMany({ where: { female: true, teamId: { not: null } }, select: { teamId: true, name: true } }),
  ]);
  const female = new Set(flagged.map((p) => playerKey(p.teamId!, p.name)));
  for (const { teams, card } of cards) {
    for (const inn of card.innings) {
      const batting = teams[inn.battingTeam].id;
      const fielding = teams[inn.battingTeam === 1 ? 2 : 1].id;
      for (const { bowler, batter } of femaleOverPlayers(inn)) {
        if (batter) female.add(playerKey(batting, batter));
        if (bowler) female.add(playerKey(fielding, bowler));
      }
    }
  }
  return { cards, female };
}

/**
 * Every player's batting, bowling and MVP totals across every submitted scoring session, for the
 * organisers' Batting, Bowling and MVP pages.
 */
export async function getPlayerStats(): Promise<Tally> {
  const { cards, female } = await cardsAndFemales();
  return tally(cards, female);
}
