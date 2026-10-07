import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rules" };

const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: "Format",
    points: [
      "6-a-side indoor cricket with a tennis ball. Every team fields at least one female and one male player.",
      "Each innings is 6 overs: three batting pairs bat 2 overs each. The pair keeps batting even after a dismissal.",
      "Every fielder bowls exactly one over.",
      "The pair with the female player must bat 1st or 2nd, never last.",
    ],
  },
  {
    title: "Scoring",
    points: [
      "Each dismissal costs the batting pair 5 runs, and runs on that ball don't count.",
      "Side net in the front half: 1 bonus run. Back half: 2 bonus runs. Side net then back net: 3 bonus runs. Plus any runs taken.",
      "Back net on the bounce: 4. Back net on the full: 6 (and the batter can't be caught).",
      "No byes or leg byes.",
    ],
  },
  {
    title: "Extras: normal overs",
    points: [
      "Wide: 1 run and re-bowled. The 4th, 5th and 6th wides in an over add 2, 4 and 6 penalty runs; the 6th ends the over.",
      "No-ball: 1 run plus runs off the bat, re-bowled. The 6th no-ball adds 6 penalty runs and ends the over.",
      "Dead ball: no runs, re-bowled. The 4th, 5th and 6th add 2, 4 and 6 penalty runs; the 6th ends the over.",
    ],
  },
  {
    title: "Extras: female overs",
    points: [
      "A female batter on strike faces a female bowler for the whole over (6 balls).",
      "Wide: 2 runs, not re-bowled. Six wides add a 6-run penalty and end the over (18 runs).",
      "Dead balls and no-balls follow the same rules as normal overs.",
    ],
  },
  {
    title: "Points & standings",
    points: [
      "Win 2 points, draw 1 each, loss 0. Weather-abandoned: 1 each.",
      "A team short of players at the start time forfeits: the opponent gets 2 points. If both are short, both get 0.",
      "Teams are ranked by points, then NRR (run difference per match). The top 2 in each group go to the quarter-finals.",
      "A knockout tie is decided by a super over (repeated until there is a winner).",
    ],
  },
  {
    title: "Conduct",
    points: [
      "Report 15 minutes before your slot. Teams are called twice; a no-show is a walkover.",
      "Only the fielding captain or the batter may query the umpire. Arguing costs 5 runs.",
      "The umpire's decision is final.",
    ],
  },
];

export default function RulesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-bold leading-none sm:text-5xl">Rules at a glance</h1>
        <p className="mt-1 text-sm text-muted">
          A summary of the SJC Sports Fest cricket rules (revised 20 Sep 2026). The organisers&apos; full rules document
          and the umpire&apos;s decision take precedence.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <section key={s.title} className="rounded-lg border border-line bg-card p-4 shadow-sm">
            <h2 className="mb-2 font-display text-xl font-semibold leading-none">{s.title}</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {s.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
