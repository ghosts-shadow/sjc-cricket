import type { Scorecard } from "@/lib/scoring";

const th = "px-1.5 py-1.5 text-right font-semibold";
const td = "px-1.5 py-1.5 text-right";

/** Per-batter card for one match, innings by innings. Organiser-only while player names aren't public. */
export function BattingCard({ card, teamName }: { card: Scorecard; teamName: (side: 1 | 2) => string }) {
  const innings = card.innings.filter((inn) => inn.overs.length > 0);
  if (innings.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[.12em] text-muted">Batting</h2>
      {innings.map((inn) => {
        const tracked = inn.batters.some((b) => b.balls > 0 || b.outs > 0);
        return (
          <div key={inn.battingTeam} className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-line bg-soft px-3 py-2">
              <h3 className="truncate font-display text-lg font-semibold leading-none">{teamName(inn.battingTeam)}</h3>
              <span className="tabular font-display text-lg font-semibold leading-none">{inn.runs}</span>
            </div>
            {tracked ? (
              <div className="overflow-x-auto">
                <table className="tabular w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-[.1em] text-muted">
                    <tr className="border-b border-line">
                      <th className="px-2 py-1.5 text-left font-semibold">Batter</th>
                      <th className={th} title="Runs off the bat">R</th>
                      <th className={th} title="Balls faced">B</th>
                      <th className={th} title="Boundary runs: off the nets and posts">Bdry</th>
                      <th className={`${th} hidden sm:table-cell`} title="Back net on the bounce">4s</th>
                      <th className={`${th} hidden sm:table-cell`} title="Back net on the full, or out over">6s</th>
                      <th className={th} title="Times out (−5 each)">Out</th>
                      <th className={`${th} pr-2 text-foreground`} title="Runs minus 5 per out">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inn.batters.map((b) => (
                      <tr key={`${b.pair}-${b.name}`} className="border-b border-line last:border-0">
                        <td className="max-w-36 truncate px-2 py-1.5 sm:max-w-56">
                          <span className="mr-1.5 text-xs text-muted">P{b.pair + 1}</span>
                          {b.name}
                        </td>
                        <td className={`${td} font-semibold`}>{b.runs}</td>
                        <td className={`${td} text-muted`}>{b.balls}</td>
                        <td className={td}>{b.bonusRuns || "–"}</td>
                        <td className={`${td} hidden sm:table-cell`}>{b.fours || "–"}</td>
                        <td className={`${td} hidden sm:table-cell`}>{b.sixes || "–"}</td>
                        <td className={td}>{b.outs || "–"}</td>
                        <td className={`${td} pr-2`}>{b.net}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul className="space-y-0.5 px-3 py-2 text-sm">
                {inn.pairTotals.map((total, p) =>
                  inn.overs.some((o) => o.pair === p) ? (
                    <li key={p} className="flex justify-between gap-2">
                      <span className="truncate">
                        Pair {p + 1}
                        {inn.pairs[p] && `: ${inn.pairs[p]![0]} & ${inn.pairs[p]![1]}`}
                      </span>
                      <span className="tabular">{total}</span>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
            {inn.dismissals.length > 0 && (
              <div className="border-t border-line px-3 py-2 text-sm">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.1em] text-muted">Wickets (−5 each)</p>
                <ul className="space-y-0.5">
                  {inn.dismissals.map((d, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="tabular w-14 shrink-0 text-muted">Over {d.over + 1}</span>
                      <span className="min-w-0">
                        <span className="font-medium">{d.batter ?? `Pair ${d.pair + 1}`}</span>
                        <span className="text-muted">
                          {" "}
                          {d.runOut ? "run out" : "out"}
                          {d.runOut && d.runs > 0 && ` after ${d.runs} run${d.runs === 1 ? "" : "s"}`}
                          {d.noBall && " (no-ball)"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {inn.unattributed > 0 && (
              <p className="border-t border-line px-3 py-2 text-xs text-muted">
                {tracked
                  ? `${inn.unattributed} ball${inn.unattributed === 1 ? "" : "s"} had no batter marked on strike, so they're only in the pair totals.`
                  : "Scored before per-batter scoring started, so there are pair totals only."}
              </p>
            )}
          </div>
        );
      })}
      {innings.some((inn) => inn.batters.some((b) => b.balls > 0 || b.outs > 0)) && (
        <p className="text-xs text-muted">
          R is runs off the bat: boundary runs (Bdry, off the nets and posts) plus runs run, including runs completed before a run out. Extras and penalties count for the pair, not the
          batter. Net is R minus 5 per out.
        </p>
      )}
    </section>
  );
}
