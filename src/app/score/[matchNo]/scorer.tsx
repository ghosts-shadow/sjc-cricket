"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import {
  battedAlready,
  BOUNDARY_VALUES,
  bowledAlready,
  cleanName,
  correctBall,
  defaultStriker,
  isRunOut,
  isWicket,
  MAX_NAME_LENGTH,
  namesBySide,
  OVERS_PER_INNINGS,
  replay,
  runningRuns,
  SIDE_VALUES,
  swapBattingFirst,
  type Ball,
  type BallAt,
  type BatterLine,
  type OverCard,
  type PairNames,
  type Scorecard,
  type ScoreEvent,
  type ScoringSetup,
  type Striker,
} from "@/lib/scoring";
import { resetScoring, submitScoring, syncScoring } from "../actions";

type Rosters = { 1: string[]; 2: string[] };

interface Props {
  matchNo: number;
  label: string;
  team1: string;
  team2: string;
  knockout: boolean;
  /** Each team's known players, for the batter and bowler dropdowns. */
  rosters: Rosters;
  initial: { setup: ScoringSetup | null; events: ScoreEvent[]; submitted: boolean; updatedAt: string | null };
}

/** Case-insensitive union of name lists, sorted. The first spelling seen wins. */
function mergeNames(...lists: string[][]): string[] {
  const byKey = new Map<string, string>();
  for (const name of lists.flat()) if (!byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

const sameName = (a: string | null, b: string | null) => a != null && b != null && a.toLowerCase() === b.toLowerCase();

interface LocalCopy {
  setup: ScoringSetup | null;
  events: ScoreEvent[];
  savedAt: number;
}

type SyncStatus = "saved" | "offline" | "error";

const SYNC_TEXT: Record<SyncStatus, string> = {
  saved: "Saved",
  offline: "Offline: saved on this phone, will retry",
  error: "Not saved to server",
};

// Runs actually run. The side runs or boundary part of a ball has its own buttons, as on the paper scoresheet.
const RUN_BUTTONS = [0, 1, 2, 3, 4, 5];
// Boundaries that are the whole ball: the back net. 1-3 wait for the runs run with them ("2+1").
const BACK_NET: readonly number[] = BOUNDARY_VALUES;

const isBoundary = (ball: Ball) => (ball.t === "run" || ball.t === "nb") && (ball.bonus ?? 0) > 0;

/** Who was on strike for a ball, if it recorded one. A plain wide and a dead ball don't. */
const strikerOf = (ball: Ball | null) => (ball && ball.t !== "db" ? ball.striker : undefined);

/** A ball's colours on the over line and the scorecard: wicket, side runs or boundary, plain run, or an extra. */
const chipTone = (ball: Ball) =>
  isWicket(ball) ? "bg-danger text-card" : isBoundary(ball) ? "bg-cricket-tint text-cricket ring-1 ring-cricket" : ball.t === "run" ? "bg-soft" : "bg-warn-tint text-warn";

/** Runs off the bat as the scoresheet writes them: "2+1" for side runs + running, "4" for a back-net four. */
function offBat(runs: number, bonus = 0): string {
  return bonus && !(BACK_NET.includes(bonus) && runs === bonus) ? `${bonus}+${runs - bonus}` : String(runs);
}

/** "1" or "(2+1)": runs before a run out, with any side runs in brackets. */
const withBonus = (runs: number, bonus = 0) => (bonus ? `(${offBat(runs, bonus)})` : String(runs));

export function chip(ball: Ball): string {
  switch (ball.t) {
    case "run":
      return offBat(ball.runs, ball.bonus);
    // Every wicket is W, however it happened (the organisers' Wickets list says how). W+2 = run out after 2 runs.
    case "out":
      return ball.runs ? `W+${withBonus(ball.runs, ball.bonus)}` : "W";
    case "wd":
      return ball.out ? "Wd W" : "Wd"; // the board writes "WD-5"
    case "db":
      return "Db";
    case "nb": {
      if (ball.out) return ball.runs ? `Nb W+${withBonus(ball.runs, ball.bonus)}` : "Nb W";
      const bat = offBat(ball.runs, ball.bonus);
      return ball.runs ? (bat.includes("+") ? `Nb+(${bat})` : `Nb+${bat}`) : "Nb";
    }
  }
}

/** Renders nothing on the server: the scorer reads this phone's saved copy on first render. */
export function Scorer(props: Props) {
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return isClient ? <ScorerApp {...props} /> : <p className="text-sm text-muted">Loading scorer…</p>;
}

interface Doc {
  setup: ScoringSetup | null;
  events: ScoreEvent[];
  /** Bumped on every change; 0 = untouched copy from the server. */
  rev: number;
}

function ScorerApp({ matchNo, label, team1, team2, knockout, rosters, initial }: Props) {
  const storageKey = `sjc-score-${matchNo}`;
  // Prefer this phone's copy if it is newer than the server's (e.g. scored while offline).
  const [doc, setDoc] = useState<Doc>(() => {
    if (!initial.submitted) {
      try {
        const raw = localStorage.getItem(storageKey);
        const local = raw ? (JSON.parse(raw) as LocalCopy) : null;
        const serverAt = initial.updatedAt ? Date.parse(initial.updatedAt) : 0;
        if (local && local.savedAt > serverAt) return { setup: local.setup, events: local.events, rev: 1 };
      } catch {
        // Storage unavailable: carry on with the server copy.
      }
    }
    return { setup: initial.setup, events: initial.events, rev: 0 };
  });
  const [synced, setSynced] = useState<{ rev: number; status: SyncStatus }>({ rev: 0, status: "saved" });
  const [retry, setRetry] = useState(0);
  const [nbPending, setNbPending] = useState(false);
  // Run out picker open: on a legal ball, or on a no-ball. It asks the runs completed, then which batter is out.
  const [runOut, setRunOut] = useState<null | "legal" | "nb">(null);
  const [runOutRuns, setRunOutRuns] = useState<number | null>(null);
  // The scorer's tap on the "on strike" toggle. It holds until the next ball off the bat, after which the
  // rules-based default (with its change of ends) takes over again. Key: innings-over-balls faced.
  const [strikerPick, setStrikerPick] = useState<{ at: string; striker: Striker } | null>(null);
  // A side 1, 2 or 3, waiting for the runs run with it.
  const [bonusPending, setBonusPending] = useState<number | null>(null);
  const closePickers = () => {
    setNbPending(false);
    setRunOut(null);
    setRunOutRuns(null);
    setBonusPending(null);
  };
  const [submitted, setSubmitted] = useState(initial.submitted);
  const [superOver, setSuperOver] = useState<1 | 2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Names added on this phone that haven't been used in an event yet.
  const [added, setAdded] = useState<Rosters>({ 1: [], 2: [] });
  const [editingPlayers, setEditingPlayers] = useState(false);
  // The ball being corrected in the "Change a ball" sheet, and a reminder left behind by the last correction.
  const [correcting, setCorrecting] = useState<BallAt | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [resetting, startReset] = useTransition();
  const { setup, events } = doc;

  // Save every change to the phone at once, and to the server shortly after.
  useEffect(() => {
    if (submitted) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ setup: doc.setup, events: doc.events, savedAt: Date.now() } satisfies LocalCopy));
    } catch {
      // Ignore: the server copy still works.
    }
    if (!doc.setup || doc.rev === 0) return;
    const rev = doc.rev;
    const timer = setTimeout(async () => {
      try {
        const res = await syncScoring(matchNo, doc.setup, doc.events);
        setSynced({ rev, status: res.ok ? "saved" : "error" });
        if (!res.ok) setError(res.error ?? null);
      } catch {
        setSynced({ rev, status: "offline" });
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [doc, submitted, retry, matchNo, storageKey]);

  // Retry as soon as the connection comes back.
  useEffect(() => {
    const onOnline = () => setRetry((n) => n + 1);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const syncText = submitted || doc.rev === 0 ? "" : synced.rev !== doc.rev ? "Saving…" : SYNC_TEXT[synced.status];
  const card = useMemo(() => (setup ? replay(setup, events) : null), [setup, events]);
  const teamName = (t: 1 | 2) => (t === 1 ? team1 : team2);
  const used = useMemo<Rosters>(() => (card ? namesBySide(card) : { 1: [], 2: [] }), [card]);
  const rosterFor = (side: 1 | 2) => mergeNames(rosters[side], used[side], added[side]);
  const addName = (side: 1 | 2, name: string) => setAdded((a) => ({ ...a, [side]: [...a[side], name] }));

  const change = (next: (d: Doc) => Omit<Doc, "rev">) => setDoc((d) => ({ ...next(d), rev: d.rev + 1 }));
  const setSetup = (s: ScoringSetup) => change((d) => ({ setup: s, events: d.events }));
  const pushMany = (more: ScoreEvent[]) => {
    if (more.length) change((d) => ({ setup: d.setup, events: [...d.events, ...more] }));
    closePickers();
    setEditingPlayers(false);
    setError(null);
    setNotice(null);
  };
  const push = (event: ScoreEvent) => pushMany([event]);
  const startOver = () => {
    const balls = events.filter((e) => e.type === "ball").length;
    const lost = balls ? ` All ${balls} ball${balls === 1 ? "" : "s"} scored so far will be deleted, on this phone and on the server.` : "";
    if (!window.confirm(`Start this match over?${lost} You'll pick who bats first again.`)) return;
    const previous = doc;
    setDoc({ setup: null, events: [], rev: 0 }); // also cancels any pending background save
    closePickers();
    setEditingPlayers(false);
    setError(null);
    startReset(async () => {
      try {
        const res = await resetScoring(matchNo);
        if (!res.ok) throw new Error(res.error);
        try {
          localStorage.removeItem(storageKey);
        } catch {}
      } catch (err) {
        setDoc(previous); // nothing was deleted on the server, so put the match back
        setError(err instanceof Error && err.message ? err.message : "Couldn't start over without a connection. Try again when you're online.");
      }
    });
  };
  const changeBattingFirst = () => {
    if (!setup) return;
    const next = setup.battingFirst === 1 ? 2 : 1;
    const balls = events.filter((e) => e.type === "ball").length;
    const detail = balls
      ? `\n\nThe ${balls} ball${balls === 1 ? "" : "s"} already scored will count for ${teamName(next)} instead, and the batter and bowler names picked so far will be cleared.`
      : "";
    if (!window.confirm(`Change the toss so ${teamName(next)} bats first?${detail}`)) return;
    change((d) => (d.setup ? swapBattingFirst(d.setup, d.events) : d));
    closePickers();
    setEditingPlayers(false);
    setError(null);
  };
  const ball = (b: Ball) => push({ type: "ball", ball: b });
  const undo = () => {
    change((d) => ({ setup: d.setup, events: d.events.slice(0, -1) }));
    closePickers();
    setNotice(null);
  };
  const startCorrecting = (at: BallAt) => {
    closePickers();
    setNotice(null);
    setCorrecting(at);
  };
  /** Save a corrected ball. Nothing after it is undone; the scorecard is rebuilt from the corrected list. */
  const saveCorrection = (at: BallAt, was: Ball, now: Ball, next: ScoreEvent[]) => {
    change((d) => ({ setup: d.setup, events: next }));
    setCorrecting(null);
    setError(null);
    // Batters change ends on an odd number of runs run, so a new count (or a new striker) can mean the balls
    // after it were credited to the wrong batter. Those are left as scored: the scorer checks them.
    const inn = replay(setup!, next).innings[at.innings];
    const over = inn.overs[at.over];
    const [before, after] = [strikerOf(was), strikerOf(now)];
    const moved = runningRuns(was) % 2 !== runningRuns(now) % 2 || before !== after;
    const later = over.balls.length > at.ball + 1 || (at.over % 2 === 0 && (inn.overs[at.over + 1]?.balls.length ?? 0) > 0);
    const what = was.t === now.t && chip(was) === chip(now) ? `Changed over ${at.over + 1}, ball ${at.ball + 1}.` : `Changed ${chip(was)} to ${chip(now)}.`;
    if (over.female && before !== undefined && after !== undefined && before !== after) {
      setNotice(`${what} ${inn.pairs[over.pair]?.[after] ?? "That batter"} now faces every ball of that female over.`);
    } else if (moved && later && !over.female) {
      setNotice(`${what} That can change who was on strike afterwards: check the balls after it, and tap any that went to the wrong batter.`);
    } else {
      setNotice(what);
    }
  };

  if (!setup || !card) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Header label={label} team1={team1} team2={team2} />
        <div className="rounded-lg border border-line bg-card p-4 shadow-sm">
          <h2 className="mb-3 font-display text-xl font-semibold leading-none">Who bats first?</h2>
          <div className="grid gap-2">
            {([1, 2] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSetup({ battingFirst: t })}
                className="rounded-md border border-line bg-soft px-4 py-3 text-left font-medium hover:border-cricket"
              >
                {teamName(t)}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">Only one person should score a match. Keep the paper scoresheet going too until the organisers say otherwise.</p>
      </div>
    );
  }

  const inningsIndex = (card.current < 2 ? card.current : null) as 0 | 1 | null;
  const innings = inningsIndex != null ? card.innings[inningsIndex] : null;
  const lastOver = innings?.overs[innings.overs.length - 1];
  const openOver = lastOver && !lastOver.complete ? lastOver : null;
  const overIndex = openOver ? openOver.index : innings?.overs.length ?? 0;
  const female = openOver?.female ?? false;
  const canToggleFemale = !openOver || openOver.balls.length === 0;
  const battingTeam = innings?.battingTeam;
  const chasing = inningsIndex === 1 && card.target != null && battingTeam != null;
  const needed = chasing ? card.target! - card.totals[battingTeam!] : null;
  // Balls stay locked until this over has a bowler and its pair has two batters.
  const fieldingTeam = battingTeam === 1 ? 2 : 1;
  const pairNames = innings ? innings.pairs[Math.floor(overIndex / 2)] : null;
  const bowlerName = openOver?.bowler ?? null;
  const needPlayers = !pairNames || !bowlerName;
  // Every fielder bowls one over and nobody bats in two pairs, so the lists leave out whoever has
  // already bowled an earlier over or batted in another pair this innings.
  const bowled = innings ? bowledAlready(innings, overIndex) : [];
  const batted = innings ? battedAlready(innings, Math.floor(overIndex / 2)) : [];
  const savePlayers = (batters: PairNames | null, bowler: string) => {
    const more: ScoreEvent[] = [];
    if (batters && (batters[0] !== pairNames?.[0] || batters[1] !== pairNames?.[1])) {
      more.push({ type: "batters", names: batters });
    }
    if (bowler !== bowlerName) more.push({ type: "bowler", name: bowler });
    pushMany(more);
  };

  // Who's on strike: the scorer's tap, held until the next ball off the bat, else the rules-based default
  // (which changes ends on odd running runs). Balls off the bat wait for it; wides and dead balls don't.
  const facedInOver = openOver?.balls.filter((b) => b.t !== "wd" && b.t !== "db").length ?? 0;
  const strikeKey = `${inningsIndex}-${overIndex}-${facedInOver}`;
  const auto = innings ? defaultStriker(innings, overIndex) : { striker: null, locked: false };
  const picked = strikerPick && strikerPick.at === strikeKey ? strikerPick.striker : null;
  const striker = auto.locked ? auto.striker : (picked ?? auto.striker);
  const noStriker = striker == null;
  const pairLines = innings?.batters.filter((b) => b.pair === Math.floor(overIndex / 2)) ?? [];
  /** A ball off the bat: the runs run, plus the side runs or boundary picked, if any. */
  const offTheBat = (noBall: boolean, running: number, bonus = bonusPending ?? 0) => {
    const detail = { runs: bonus + running, striker: striker!, ...(bonus ? { bonus } : {}) };
    ball(noBall ? { t: "nb", ...detail } : { t: "run", ...detail });
  };
  /** Back net 4 / 6 is the whole ball. 1-3 wait for the runs run with them; tapping it again cancels. */
  const pickBonus = (noBall: boolean) => (value: number) => {
    if (BACK_NET.includes(value)) offTheBat(noBall, 0, value);
    else setBonusPending((p) => (p === value ? null : value));
  };
  // Right after a plain wide, the scorer can turn it into a wicket on a wide (stumped or run out). Find the
  // pair that faced it and who was on strike: a 6th wide can end the over, or even the pair's turn.
  const last = events[events.length - 1];
  let wideWicket: { names: PairNames; striker: Striker | null } | null = null;
  if (!submitted && last?.type === "ball" && last.ball.t === "wd" && !last.ball.out) {
    const inn = [...card.innings].reverse().find((i) => i.overs.some((o) => o.balls.length > 0));
    const over = inn?.overs.filter((o) => o.balls.length > 0).pop();
    const names = inn && over ? inn.pairs[over.pair] : null;
    if (inn && over && names) wideWicket = { names, striker: over === openOver ? striker : defaultStriker(inn, over.index).striker };
  }
  /** Replace the last wide with the same wide plus a wicket: the wide's runs stand, then -5. */
  const outOnLastWide = (who: Striker, runOut: boolean) => {
    const onStrike = wideWicket?.striker ?? who; // not known yet: the batter picked stands for it
    const wide: Ball = { t: "wd", out: true, striker: onStrike, ...(runOut ? { runOut: true } : {}), ...(who !== onStrike ? { nonStriker: true } : {}) };
    change((d) => ({ setup: d.setup, events: [...d.events.slice(0, -1), { type: "ball", ball: wide }] }));
    closePickers();
    setError(null);
  };
  /** Last step of a run out: the batter who's out. Any side runs and the runs completed were picked first. */
  const runOutBall = (who: Striker) => {
    const bonus = bonusPending ?? 0;
    const detail = {
      runs: bonus + (runOutRuns ?? 0),
      striker: striker!,
      ...(bonus ? { bonus } : {}),
      ...(who !== striker ? { nonStriker: true as const } : {}),
    };
    ball(runOut === "nb" ? { t: "nb", out: true, ...detail } : { t: "out", runOut: true, ...detail });
  };

  const submit = () => {
    if (!card.result) return;
    const winner = card.result.winner;
    const summary =
      winner === null
        ? knockout
          ? `Tie: ${superOver ? teamName(superOver) : "?"} won the super over`
          : "Tie: recorded as a draw"
        : `${teamName(winner)} won by ${card.result.margin}`;
    if (!window.confirm(`Submit the final result?\n\n${team1} ${card.totals[1]}\n${team2} ${card.totals[2]}\n${summary}\n\nThis updates the public standings.`)) return;
    startSubmit(async () => {
      const res = await submitScoring(matchNo, setup, events, superOver);
      if (res.ok) {
        setSubmitted(true);
        try {
          localStorage.removeItem(storageKey);
        } catch {}
      } else {
        setError(res.error ?? "Could not submit.");
      }
    });
  };

  return (
    <div className="mx-auto max-w-md space-y-4 pb-10">
      <Header label={label} team1={team1} team2={team2} sync={syncText} />
      {!submitted && (
        <p className="-mt-2 text-xs text-muted">Viewers see this match one over behind. Scored a ball wrong? Undo it, or tap the ball to change it.</p>
      )}

      <TotalsBar card={card} team1={team1} team2={team2} />

      {wideWicket && <WideWicket key={events.length} names={wideWicket.names} striker={wideWicket.striker} onOut={outOnLastWide} />}

      {submitted && (
        <div className="rounded-lg border border-win/50 bg-win-tint p-4 text-sm">
          <p className="font-semibold">Result submitted. The public site is updated.</p>
          <p className="mt-1 text-muted">
            Something wrong? An organiser can reopen live scoring on the{" "}
            <Link href={`/admin/match/${matchNo}`} className="underline underline-offset-2">
              match&apos;s result page
            </Link>
            .
          </p>
          <Link href="/score" className="mt-2 inline-block underline underline-offset-2">
            ← All matches
          </Link>
        </div>
      )}

      {!submitted && innings && battingTeam && (
        <section className="space-y-3 rounded-lg border border-line bg-card p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted">
                Innings {inningsIndex! + 1} · {teamName(battingTeam)} batting ·{" "}
                <button onClick={changeBattingFirst} className="underline underline-offset-2">
                  Change who bats first
                </button>
              </p>
              <p className="font-semibold">
                Pair {Math.floor(overIndex / 2) + 1} · Over {overIndex + 1} of {OVERS_PER_INNINGS}
              </p>
              {chasing && needed != null && (
                <p className="text-sm text-muted">{needed > 0 ? `Needs ${needed} to win` : "Target reached"}</p>
              )}
            </div>
            <label className={`flex items-center gap-2 text-sm ${canToggleFemale ? "" : "opacity-50"}`}>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={female}
                disabled={!canToggleFemale}
                onChange={(e) => push({ type: "female", on: e.target.checked })}
              />
              Female over
            </label>
          </div>

          {needPlayers || editingPlayers ? (
            <PlayersForm
              key={`${inningsIndex}-${overIndex}-${editingPlayers}`}
              title={
                editingPlayers
                  ? `Change players for over ${overIndex + 1}`
                  : pairNames
                    ? `Over ${overIndex + 1}: who's bowling?`
                    : `Pair ${Math.floor(overIndex / 2) + 1}, over ${overIndex + 1}: who's batting and bowling?`
              }
              battingTeam={teamName(battingTeam)}
              fieldingTeam={teamName(fieldingTeam)}
              batRoster={rosterFor(battingTeam)}
              bowlRoster={rosterFor(fieldingTeam)}
              pair={pairNames}
              bowler={bowlerName}
              bowled={bowled}
              batted={batted}
              askBatters={editingPlayers || !pairNames}
              onAdd={(side, name) => addName(side === "bat" ? battingTeam : fieldingTeam, name)}
              onSave={savePlayers}
              onCancel={editingPlayers ? () => setEditingPlayers(false) : undefined}
            />
          ) : (
            <>
              <p className="flex items-start justify-between gap-2 text-sm">
                <span>
                  <span className="text-muted">Batting</span> {pairNames![0]} &amp; {pairNames![1]}
                  <span className="text-muted"> · Bowling</span> {bowlerName}
                </span>
                <button onClick={() => setEditingPlayers(true)} className="shrink-0 text-xs text-muted underline underline-offset-2">
                  Change
                </button>
              </p>
              <OverLine over={openOver} onEdit={(ball) => startCorrecting({ innings: inningsIndex!, over: overIndex, ball })} />
              <StrikerToggle
                names={pairNames!}
                lines={pairLines}
                striker={striker}
                locked={auto.locked}
                female={female}
                onPick={(s) => setStrikerPick({ at: strikeKey, striker: s })}
              />
              {runOut && runOutRuns == null ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {runOut === "nb" ? "No-ball and run out: what was scored first?" : "Run out: what was scored first?"}
                  </p>
                  <ShotPanels
                    forRunOut
                    bonus={bonusPending}
                    onBonus={(value) => setBonusPending((p) => (p === value ? null : value))}
                    onRuns={(r) => setRunOutRuns(r)}
                  />
                  <button onClick={closePickers} className="w-full rounded-md border border-line py-2.5 text-sm">
                    Cancel
                  </button>
                  <p className="text-xs text-muted">
                    Side runs and the runs completed before the run out still count for the striker
                    {runOut === "nb" ? ", plus 1 for the no-ball (re-bowled)" : ""}. Next: which batter is out.
                  </p>
                </div>
              ) : runOut ? (
                <div>
                  <p className="mb-2 text-sm font-medium">
                    Run out after {bonusPending ? `${bonusPending}+${runOutRuns}` : `${runOutRuns} run${runOutRuns === 1 ? "" : "s"}`}: which batter is
                    out?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {pairNames!.map((name, i) => (
                      <button
                        key={i}
                        onClick={() => runOutBall(i as Striker)}
                        className="min-h-14 min-w-0 rounded-md border border-danger/60 bg-danger-tint px-3 py-2.5 text-left font-medium active:scale-95"
                      >
                        <span className="block truncate">{name}</span>
                        <span className="block text-xs font-normal text-muted">{striker === i ? "on strike" : "other end"}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <button onClick={() => setRunOutRuns(null)} className="rounded-md border border-line py-2.5">
                      ← Runs
                    </button>
                    <button onClick={closePickers} className="rounded-md border border-line py-2.5">
                      Cancel
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-muted">−5 against the batter you pick.</p>
                </div>
              ) : nbPending ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">No-ball: what came off the bat?</p>
                  <ShotPanels bonus={bonusPending} onBonus={pickBonus(true)} onRuns={(r) => offTheBat(true, r)} />
                  <div className="grid grid-cols-2 gap-2">
                    <BigButton
                      tone="danger"
                      onClick={() => {
                        setBonusPending(null);
                        setRunOut("nb");
                      }}
                    >
                      <span className="text-base">Run out</span>
                    </BigButton>
                    <BigButton tone="muted" onClick={closePickers}>
                      Cancel
                    </BigButton>
                  </div>
                </div>
              ) : (
                <>
                  <ShotPanels bonus={bonusPending} disabled={noStriker} onBonus={pickBonus(false)} onRuns={(r) => offTheBat(false, r)} />
                  <div className="grid grid-cols-5 gap-2">
                    <BigButton tone="danger" disabled={noStriker} onClick={() => ball({ t: "out", striker: striker! })}>
                      OUT
                    </BigButton>
                    <BigButton
                      tone="danger"
                      disabled={noStriker}
                      onClick={() => {
                        setBonusPending(null);
                        setRunOut("legal");
                      }}
                    >
                      <span className="block text-base leading-tight">Run out</span>
                    </BigButton>
                    <BigButton tone="extra" onClick={() => ball({ t: "wd" })}>
                      WD
                    </BigButton>
                    <BigButton
                      tone="extra"
                      disabled={noStriker}
                      onClick={() => {
                        setBonusPending(null);
                        setNbPending(true);
                      }}
                    >
                      NB
                    </BigButton>
                    <BigButton tone="extra" onClick={() => ball({ t: "db" })}>
                      DB
                    </BigButton>
                  </div>
                </>
              )}
            </>
          )}

          <div className="grid grid-cols-3 gap-2 text-sm">
            <button onClick={undo} disabled={events.length === 0} className="rounded-md border border-line py-2.5 disabled:opacity-40">
              Undo
            </button>
            <PenaltyButton team1={team1} team2={team2} onPenalty={(team) => push({ type: "penalty", team, runs: 5, note: "Misconduct" })} />
            <button
              onClick={() => window.confirm(`End ${teamName(battingTeam)}'s innings now?`) && push({ type: "endInnings" })}
              className="rounded-md border border-line py-2.5"
            >
              End innings
            </button>
          </div>
        </section>
      )}

      {!submitted && card.finished && card.result && (
        <section className="space-y-3 rounded-lg border border-line bg-card p-4 shadow-sm">
          <h2 className="font-display text-xl font-semibold leading-none">Match finished</h2>
          <p className="text-sm">
            {card.result.winner
              ? `${teamName(card.result.winner)} win by ${card.result.margin} runs.`
              : knockout
                ? "Scores are level: play a super over, then pick the winner."
                : "Scores are level: recorded as a draw (1 point each)."}
          </p>
          {card.result.winner === null && knockout && (
            <div className="grid grid-cols-2 gap-2">
              {([1, 2] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSuperOver(t)}
                  className={`rounded-md border px-3 py-2 text-sm ${superOver === t ? "border-accent bg-cricket-tint text-foreground" : "border-line"}`}
                >
                  {teamName(t)} won super over
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={undo} className="rounded-md border border-line py-2.5 text-sm">
              Undo last
            </button>
            <button
              onClick={submit}
              disabled={submitting || (card.result.winner === null && knockout && superOver === null)}
              className="rounded-md bg-accent py-2.5 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit result"}
            </button>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-loss">{error}</p>}
      {notice && !submitted && (
        <p role="status" className="rounded-lg border border-line bg-soft p-3 text-sm">
          {notice}
        </p>
      )}
      {card.warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-warn/40 bg-warn-tint p-3 text-sm">
          {card.warnings.map((w) => (
            <li key={w}>⚠ {w.replace(/^Team (1|2)/, (_, t) => teamName(Number(t) as 1 | 2))}</li>
          ))}
        </ul>
      )}

      <ScorecardView card={card} teamName={teamName} onEdit={submitted ? undefined : startCorrecting} />

      {!submitted && (
        <button onClick={startOver} disabled={resetting} className="text-xs text-muted underline underline-offset-2 disabled:opacity-60">
          {resetting ? "Starting over…" : "Start this match over"}
        </button>
      )}

      {!submitted && correcting && card.innings[correcting.innings].overs[correcting.over]?.balls[correcting.ball] && (
        <BallEditor
          key={`${correcting.innings}-${correcting.over}-${correcting.ball}`}
          setup={setup}
          events={events}
          at={correcting}
          over={card.innings[correcting.innings].overs[correcting.over]}
          names={card.innings[correcting.innings].pairs[card.innings[correcting.innings].overs[correcting.over].pair]}
          team={teamName(card.innings[correcting.innings].battingTeam)}
          onSave={saveCorrection}
          onCancel={() => setCorrecting(null)}
        />
      )}
    </div>
  );
}

function Header({ label, team1, team2, sync }: { label: string; team1: string; team2: string; sync?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <Link href="/score" className="underline underline-offset-2">
          ← All matches
        </Link>
        {sync && <span>{sync}</span>}
      </div>
      <h1 className="mt-2 font-display text-2xl font-semibold leading-tight">
        {team1} <span className="font-normal text-muted">v</span> {team2}
      </h1>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function TotalsBar({ card, team1, team2 }: { card: Scorecard; team1: string; team2: string }) {
  const rows = [
    { team: 1 as const, name: team1 },
    { team: 2 as const, name: team2 },
  ];
  return (
    <div className="sticky top-0 z-10 grid grid-cols-2 gap-2 rounded-lg border border-line bg-card p-2 shadow-sm">
      {rows.map((r) => {
        const batting = card.current < 2 && card.innings[card.current as 0 | 1].battingTeam === r.team;
        return (
          <div key={r.team} className={`rounded-md p-2 ${batting ? "bg-cricket-tint" : "opacity-70"}`}>
            <p className="truncate text-xs">{r.name}</p>
            <p className="tabular font-display text-5xl font-semibold leading-none">{card.totals[r.team]}</p>
            {batting && <p className="text-xs font-medium text-cricket">batting</p>}
          </div>
        );
      })}
    </div>
  );
}

function OverLine({ over, onEdit }: { over: OverCard | null; onEdit: (ball: number) => void }) {
  if (!over || over.balls.length === 0) return <p className="text-sm text-muted">New over: tap the first ball.</p>;
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {over.balls.map((b, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onEdit(i)}
            aria-label={`Change ball ${i + 1}: ${chip(b)}`}
            className={`tabular min-h-8 min-w-8 rounded px-2 py-1 text-sm font-medium ${chipTone(b)}`}
          >
            {chip(b)}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">
        {over.legalBalls}/6 balls · over total {over.total}
        {over.penalties > 0 && ` (incl. ${over.penalties} penalty)`}
      </p>
    </div>
  );
}

const ADD_PLAYER = "__add__";
const pickerClass = "mt-1 w-full rounded-md border border-edge bg-background px-3 py-2.5 text-base";

/** Players who've already had their turn this innings: left out of a picker's list until "Show all". */
interface Taken {
  /** "bowled" or "batted", for "2 who already bowled are hidden." */
  verb: string;
  /** The rule, shown when one of them is picked anyway. */
  rule: string;
  /** Each name with what they did: "bowled over 2", "batted in pair 1". */
  players: { name: string; did: string }[];
}

/** A roster dropdown whose last option, "+ Add player…", turns it into a name box. */
function NamePicker({
  label,
  options,
  value,
  exclude,
  taken,
  onChange,
  onAdd,
}: {
  label: string;
  options: string[];
  value: string | null;
  /** A name taken by the other picker (the other batter), shown but not selectable. */
  exclude?: string | null;
  /** Who already bowled or batted this innings. A mis-tap can't pick them; "Show all" still can. */
  taken?: Taken;
  onChange: (name: string) => void;
  onAdd: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const didAlready = (name: string | null) => taken?.players.find((p) => sameName(p.name, name))?.did ?? null;
  // Starts open when the current pick is one of them, so the dropdown can still show it.
  const [showTaken, setShowTaken] = useState(() => didAlready(value) != null);
  const hidden = showTaken ? 0 : options.filter((o) => didAlready(o) != null).length;
  const pickedDid = didAlready(value);

  const commit = () => {
    const name = cleanName(draft);
    if (!name) return;
    const existing = options.find((o) => sameName(o, name));
    if (!existing) onAdd(name);
    else if (didAlready(existing) != null) setShowTaken(true); // a hidden name, typed on purpose
    onChange(existing ?? name);
    setAdding(false);
    setDraft("");
  };

  if (adding) {
    return (
      <div>
        <span className="text-xs text-muted">{label}</span>
        <div className="mt-1 flex gap-2">
          <input
            autoFocus
            value={draft}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Player name"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className="min-w-0 flex-1 rounded-md border border-edge bg-background px-3 py-2.5 text-base"
          />
          <button onClick={commit} disabled={!cleanName(draft)} className="rounded-md bg-accent px-3 text-sm font-medium text-white disabled:opacity-50">
            Add
          </button>
          <button onClick={() => setAdding(false)} className="rounded-md border border-line px-3 text-sm">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block">
        <span className="text-xs text-muted">{label}</span>
        <select
          value={value ?? ""}
          onChange={(e) => (e.target.value === ADD_PLAYER ? setAdding(true) : onChange(e.target.value))}
          className={pickerClass}
        >
          <option value="" disabled>
            Choose…
          </option>
          {options.map((name) => {
            const did = didAlready(name);
            if (did != null && !showTaken) return null;
            return (
              <option key={name} value={name} disabled={sameName(name, exclude ?? null)}>
                {did != null ? `${name} (${did})` : name}
              </option>
            );
          })}
          <option value={ADD_PLAYER}>+ Add player…</option>
        </select>
      </label>
      {hidden > 0 && (
        <p className="mt-1 text-xs text-muted">
          {hidden} who already {taken?.verb} {hidden === 1 ? "is" : "are"} hidden.{" "}
          <button onClick={() => setShowTaken(true)} className="underline underline-offset-2">
            Show all
          </button>
        </p>
      )}
      {pickedDid != null && (
        <p className="mt-1 text-xs text-warn">
          {value} already {pickedDid}. {taken?.rule}
        </p>
      )}
    </div>
  );
}

/** Asks for the batting pair (at the start of each pair) and the bowler (every over). */
function PlayersForm({
  title,
  battingTeam,
  fieldingTeam,
  batRoster,
  bowlRoster,
  pair,
  bowler,
  bowled,
  batted,
  askBatters,
  onAdd,
  onSave,
  onCancel,
}: {
  title: string;
  battingTeam: string;
  fieldingTeam: string;
  batRoster: string[];
  bowlRoster: string[];
  pair: PairNames | null;
  bowler: string | null;
  /** Who bowled an earlier over this innings: kept out of the bowler list. */
  bowled: { name: string; over: number }[];
  /** Who batted in the innings' other pairs: kept out of both batter lists. */
  batted: { name: string; pair: number }[];
  askBatters: boolean;
  onAdd: (side: "bat" | "bowl", name: string) => void;
  onSave: (batters: PairNames | null, bowler: string) => void;
  onCancel?: () => void;
}) {
  const [b1, setB1] = useState<string | null>(pair?.[0] ?? null);
  const [b2, setB2] = useState<string | null>(pair?.[1] ?? null);
  const [bowl, setBowl] = useState<string | null>(bowler);
  const bowledTaken: Taken = { verb: "bowled", rule: "Every fielder bowls one over.", players: bowled.map((b) => ({ name: b.name, did: `bowled over ${b.over}` })) };
  const battedTaken: Taken = { verb: "batted", rule: "Nobody bats in two pairs.", players: batted.map((b) => ({ name: b.name, did: `batted in pair ${b.pair}` })) };
  const battersOk = !askBatters || (b1 != null && b2 != null && !sameName(b1, b2));
  const ready = battersOk && bowl != null;

  return (
    <div className="space-y-3 rounded-md border border-edge bg-raised p-3">
      <p className="text-sm font-medium">{title}</p>
      {askBatters ? (
        <>
          <NamePicker label={`Batter 1 · ${battingTeam}`} options={batRoster} value={b1} exclude={b2} taken={battedTaken} onChange={setB1} onAdd={(n) => onAdd("bat", n)} />
          <NamePicker label={`Batter 2 · ${battingTeam}`} options={batRoster} value={b2} exclude={b1} taken={battedTaken} onChange={setB2} onAdd={(n) => onAdd("bat", n)} />
        </>
      ) : (
        pair && (
          <p className="text-sm">
            <span className="text-muted">Batting</span> {pair[0]} &amp; {pair[1]}
          </p>
        )
      )}
      <NamePicker label={`Bowler · ${fieldingTeam}`} options={bowlRoster} value={bowl} taken={bowledTaken} onChange={setBowl} onAdd={(n) => onAdd("bowl", n)} />
      <div className="flex gap-2">
        {onCancel && (
          <button onClick={onCancel} className="rounded-md border border-line px-4 py-2.5 text-sm">
            Cancel
          </button>
        )}
        <button
          onClick={() => ready && onSave(askBatters ? [b1!, b2!] : null, bowl!)}
          disabled={!ready}
          className="flex-1 rounded-md bg-accent py-2.5 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {onCancel ? "Save" : "Start scoring"}
        </button>
      </div>
    </div>
  );
}

function BigButton({
  children,
  onClick,
  tone = "run",
  disabled = false,
  selected = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "run" | "boundary" | "danger" | "extra" | "muted";
  disabled?: boolean;
  selected?: boolean;
}) {
  const tones = {
    run: "bg-soft border-line",
    boundary: "bg-cricket-tint border-cricket text-foreground",
    danger: "bg-danger text-card border-danger",
    extra: "bg-warn-tint text-warn border-warn/40",
    muted: "bg-card border-line text-sm",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected || undefined}
      className={`min-h-14 rounded-md border font-display text-2xl font-semibold active:scale-95 disabled:opacity-35 disabled:active:scale-100 ${
        selected ? "border-accent bg-accent text-white" : tones[tone]
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Follow-up to a wide: was a batter also out on it? Stumping is only possible for the batter on strike;
 * either batter can be run out. The wide still counts (+1 re-bowled, or +2 in a female over), then -5.
 */
function WideWicket({ names, striker, onOut }: { names: PairNames; striker: Striker | null; onOut: (who: Striker, runOut: boolean) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full rounded-md border border-danger/60 py-2.5 text-sm font-medium text-danger">
        Wicket on that wide? (stumped or run out)
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-danger/60 bg-danger-tint p-3">
      <p className="mb-2 text-sm font-medium">Out on the wide: who, and how?</p>
      <div className="grid grid-cols-2 gap-2">
        {names.map((name, i) => (
          <div key={i} className="min-w-0 space-y-1.5">
            <p className="truncate text-sm font-medium">
              {name}
              <span className="block text-xs font-normal text-muted">{striker === null ? " " : striker === i ? "on strike" : "other end"}</span>
            </p>
            <button
              onClick={() => onOut(i as Striker, false)}
              disabled={striker !== null && striker !== i}
              className="w-full rounded-md border border-danger bg-danger py-2.5 text-sm font-medium text-card disabled:opacity-35"
            >
              Stumped
            </button>
            <button onClick={() => onOut(i as Striker, true)} className="w-full rounded-md border border-danger bg-danger py-2.5 text-sm font-medium text-card">
              Run out
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted">The wide still counts, then −5 against the batter you pick.</p>
        <button onClick={() => setOpen(false)} className="shrink-0 rounded-md border border-line px-3 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * The paper scoresheet's parts of a ball off the bat: side runs (1-3 off the side nets and posts) or a
 * boundary (4 / 6 off the back net), and the runs run. "2+1" is tap side 2, then 1. A boundary is the
 * whole ball, so it counts at once.
 */
function ShotPanels({
  bonus,
  disabled = false,
  forRunOut = false,
  onBonus,
  onRuns,
}: {
  bonus: number | null;
  disabled?: boolean;
  /** Run out: side runs only (on a back-net 4 or 6 the ball is dead and nobody runs), and the runs completed. */
  forRunOut?: boolean;
  onBonus: (value: number) => void;
  onRuns: (running: number) => void;
}) {
  const button = (value: number) => (
    <BigButton key={value} tone="boundary" selected={bonus === value} disabled={disabled} onClick={() => onBonus(value)}>
      {value}
    </BigButton>
  );
  return (
    <>
      <div>
        {bonus ? (
          <p className="mb-1 text-xs font-medium text-accent">
            Side {bonus}: now tap the runs {forRunOut ? "completed" : "run"} with it (0 if none)
          </p>
        ) : (
          forRunOut && <p className="mb-1 text-xs text-muted">Side runs first, if it hit a side net or post (skip if not)</p>
        )}
        <div className="flex gap-2">
          <div className="min-w-0 flex-[3]">
            <p className="mb-1 text-xs text-muted">Side · nets &amp; posts</p>
            <div className="grid grid-cols-3 gap-2">{SIDE_VALUES.map(button)}</div>
          </div>
          {!forRunOut && (
            <div className="min-w-0 flex-[2] border-l border-line pl-2">
              <p className="mb-1 text-xs text-muted">Boundary · back net</p>
              <div className="grid grid-cols-2 gap-2">{BOUNDARY_VALUES.map(button)}</div>
            </div>
          )}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs text-muted">{forRunOut ? "Runs completed" : "Runs run"}</p>
        <div className="grid grid-cols-3 gap-2">
          {RUN_BUTTONS.map((r) => (
            <BigButton key={r} disabled={disabled} onClick={() => onRuns(r)}>
              {bonus ? `${bonus}+${r}` : r}
            </BigButton>
          ))}
        </div>
      </div>
    </>
  );
}

/** The two batters of the pair; the highlighted one is credited with the next ball off the bat. */
function StrikerToggle({
  names,
  lines,
  striker,
  locked,
  female,
  onPick,
}: {
  names: PairNames;
  lines: BatterLine[];
  striker: Striker | null;
  locked: boolean;
  female: boolean;
  onPick: (striker: Striker) => void;
}) {
  const hint =
    striker == null
      ? female
        ? "Female over: tap the female batter."
        : "Who's on strike? Tap a name."
      : locked
        ? "Female batter stays on strike all over (undo to change)."
        : "On strike. Swaps ends by itself on an odd number of runs run; tap a name to correct it.";
  return (
    <div className={`rounded-md border p-2 ${striker == null ? "border-warn bg-warn-tint" : "border-line"}`}>
      <p className={`mb-1.5 text-xs ${striker == null ? "font-medium text-warn" : "text-muted"}`}>{hint}</p>
      <div className="grid grid-cols-2 gap-2">
        {names.map((name, i) => {
          const line = lines.find((l) => l.name === name);
          const on = striker === i;
          return (
            <button
              key={i}
              onClick={() => onPick(i as Striker)}
              disabled={locked && !on}
              className={`min-w-0 rounded-md border px-3 py-2 text-left disabled:opacity-40 ${
                on ? "border-accent bg-cricket-tint text-foreground" : "border-line bg-card text-muted"
              }`}
            >
              <span className="block truncate font-medium">
                {on && <span aria-hidden="true">● </span>}
                {name}
              </span>
              {line && (
                <span className="tabular block text-xs text-muted">
                  {line.runs} ({line.balls}){line.outs > 0 && ` · out ${line.outs}`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PenaltyButton({ team1, team2, onPenalty }: { team1: string; team2: string; onPenalty: (team: 1 | 2) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-md border border-line py-2.5">
        −5 penalty
      </button>
    );
  }
  return (
    <div className="col-span-3 grid grid-cols-3 gap-2">
      {([1, 2] as const).map((t) => (
        <button
          key={t}
          onClick={() => {
            if (window.confirm(`Deduct 5 runs from ${t === 1 ? team1 : team2} for misconduct?`)) onPenalty(t);
            setOpen(false);
          }}
          className="truncate rounded-md border border-danger/60 px-2 py-2.5 text-danger"
        >
          −5 {t === 1 ? team1 : team2}
        </button>
      ))}
      <button onClick={() => setOpen(false)} className="rounded-md border border-line py-2.5">
        Cancel
      </button>
    </div>
  );
}

type BallKind = "legal" | "wd" | "nb" | "db";
type WicketKind = "none" | "out" | "runout";

/** What's picked in the "Change a ball" sheet. */
interface BallDraft {
  kind: BallKind;
  wicket: WicketKind;
  /** Side runs 1-3 or a back-net 4 / 6; 0 = none. */
  bonus: number;
  /** Runs run, or completed before a run out. */
  running: number;
  striker: Striker | null;
  /** Who was run out. Any other wicket is the striker's. */
  outWho: Striker | null;
}

/** The sheet's starting picks: the ball as it was scored. `striker` stands in when the ball had nobody on strike. */
function draftOf(ball: Ball, striker: Striker | null): BallDraft {
  if (ball.t === "db") return { kind: "db", wicket: "none", bonus: 0, running: 0, striker, outWho: null };
  const bonus = ball.t === "wd" ? 0 : (ball.bonus ?? 0);
  const running = ball.t === "wd" ? 0 : (ball.runs ?? 0) - bonus;
  const wicket: WicketKind = !isWicket(ball) ? "none" : isRunOut(ball) ? "runout" : "out";
  const outWho =
    wicket === "runout" && ball.striker !== undefined ? ((ball.t !== "run" && ball.nonStriker ? 1 - ball.striker : ball.striker) as Striker) : null;
  return { kind: ball.t === "run" || ball.t === "out" ? "legal" : ball.t, wicket, bonus, running, striker: ball.striker ?? striker, outWho };
}

/** Drop picks that don't go together: no catch off a no-ball, no back-net boundary with a run out. */
function tidy(d: BallDraft): BallDraft {
  const wicket = d.kind === "db" || (d.kind === "nb" && d.wicket === "out") ? "none" : d.wicket;
  return { ...d, wicket, bonus: wicket === "runout" && BACK_NET.includes(d.bonus) ? 0 : d.bonus, outWho: wicket === "runout" ? d.outWho : null };
}

/** The ball the picks describe, built the way the scoring buttons build it. Null while something is still to pick. */
function ballOf(d: BallDraft): Ball | null {
  if (d.kind === "db") return { t: "db" };
  if (d.kind === "wd" && d.wicket === "none") return { t: "wd" };
  if (d.striker === null || (d.wicket === "runout" && d.outWho === null)) return null;
  const striker = d.striker;
  const otherEnd = d.wicket === "runout" && d.outWho !== striker ? { nonStriker: true as const } : {};
  if (d.kind === "wd") return { t: "wd", out: true, striker, ...(d.wicket === "runout" ? { runOut: true as const } : {}), ...otherEnd };
  if (d.kind === "legal" && d.wicket === "out") return { t: "out", striker };
  const offBat = { runs: d.bonus + (BACK_NET.includes(d.bonus) ? 0 : d.running), striker, ...(d.bonus ? { bonus: d.bonus } : {}) };
  if (d.kind === "nb") return d.wicket === "runout" ? { t: "nb", out: true, ...offBat, ...otherEnd } : { t: "nb", ...offBat };
  return d.wicket === "runout" ? { t: "out", runOut: true, ...offBat, ...otherEnd } : { t: "run", ...offBat };
}

const BALL_KINDS: { kind: BallKind; label: string }[] = [
  { kind: "legal", label: "Normal" },
  { kind: "wd", label: "Wide" },
  { kind: "nb", label: "No-ball" },
  { kind: "db", label: "Dead ball" },
];

function Pick({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-11 min-w-0 rounded-md border px-1.5 text-sm font-medium ${on ? "border-accent bg-accent text-white" : "border-line bg-soft"}`}
    >
      <span className="block truncate">{children}</span>
    </button>
  );
}

/**
 * Correct a ball that's already on the scorecard, in any over, without undoing what came after it.
 * The picks are checked as they're made, so a change that can't be saved says why before Save.
 */
function BallEditor({
  setup,
  events,
  at,
  over,
  names,
  team,
  onSave,
  onCancel,
}: {
  setup: ScoringSetup;
  events: ScoreEvent[];
  at: BallAt;
  over: OverCard;
  names: PairNames | null;
  /** The batting team's name. */
  team: string;
  onSave: (at: BallAt, was: Ball, now: Ball, events: ScoreEvent[]) => void;
  onCancel: () => void;
}) {
  const was = over.balls[at.ball];
  // A female over has one batter on strike throughout: a ball that had nobody (a wide, a dead ball) starts on her.
  const faced = over.female ? over.balls.find((b) => b.t !== "db" && b.striker !== undefined) : undefined;
  const [start] = useState(() => draftOf(was, faced && faced.t !== "db" ? (faced.striker ?? null) : null));
  const [draft, setDraft] = useState(start);
  const set = (patch: Partial<BallDraft>) => setDraft((d) => tidy({ ...d, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const now = ballOf(draft);
  const changed = now !== null && JSON.stringify(now) !== JSON.stringify(ballOf(start));
  const result = now ? correctBall(setup, events, at, now) : null;
  const total = result?.ok ? replay(setup, result.events).innings[at.innings].overs[at.over].total : null;

  const showRuns = draft.kind === "nb" || (draft.kind === "legal" && draft.wicket !== "out");
  const showStriker = draft.kind === "legal" || draft.kind === "nb" || (draft.kind === "wd" && draft.wicket !== "none");
  const bonuses = [0, ...SIDE_VALUES, ...(draft.wicket === "runout" ? [] : BOUNDARY_VALUES)];
  const runs = RUN_BUTTONS.includes(draft.running) ? RUN_BUTTONS : [...RUN_BUTTONS, draft.running];
  const wickets: { wicket: WicketKind; label: string }[] =
    draft.kind === "db"
      ? []
      : [
          { wicket: "none", label: "No wicket" },
          ...(draft.kind === "nb" ? [] : [{ wicket: "out" as const, label: draft.kind === "wd" ? "Stumped" : "Out" }]),
          { wicket: "runout", label: "Run out" },
        ];
  const batter = (i: number) => names?.[i] ?? `Batter ${i + 1}`;
  const label = "mb-1 text-xs text-muted";

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change a ball"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-xl border border-line bg-card p-4 shadow-lg"
      >
        <div>
          <h2 className="font-display text-xl font-semibold leading-none">Change a ball</h2>
          <p className="mt-1.5 text-sm text-muted">
            {team} · over {at.over + 1}, ball {at.ball + 1}
            {over.female && " · female over"}
            {over.bowler && ` · bowled by ${over.bowler}`}
          </p>
          <p className="mt-1.5 text-sm">
            Scored as <span className={`tabular rounded px-2 py-0.5 font-medium ${chipTone(was)}`}>{chip(was)}</span>
          </p>
        </div>

        <div role="group" aria-label="Type of ball">
          <p className={label}>Type of ball</p>
          <div className="grid grid-cols-4 gap-2">
            {BALL_KINDS.map((k) => (
              <Pick key={k.kind} on={draft.kind === k.kind} onClick={() => set({ kind: k.kind })}>
                {k.label}
              </Pick>
            ))}
          </div>
        </div>

        {wickets.length > 0 && (
          <div role="group" aria-label="Wicket">
            <p className={label}>Wicket (−5)</p>
            <div className={`grid gap-2 ${wickets.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {wickets.map((w) => (
                <Pick key={w.wicket} on={draft.wicket === w.wicket} onClick={() => set({ wicket: w.wicket })}>
                  {w.label}
                </Pick>
              ))}
            </div>
          </div>
        )}

        {showRuns && (
          <>
            <div role="group" aria-label="Side runs or boundary">
              <p className={label}>{draft.wicket === "runout" ? "Side runs · nets & posts" : "Side runs (1–3) or back-net boundary (4, 6)"}</p>
              <div className={`grid gap-2 ${bonuses.length === 6 ? "grid-cols-6" : "grid-cols-4"}`}>
                {bonuses.map((value) => (
                  <Pick key={value} on={draft.bonus === value} onClick={() => set({ bonus: value })}>
                    {value === 0 ? "None" : value}
                  </Pick>
                ))}
              </div>
            </div>
            {BACK_NET.includes(draft.bonus) ? (
              <p className="text-xs text-muted">A back-net {draft.bonus} is the whole ball: nothing is added for running.</p>
            ) : (
              <div role="group" aria-label={draft.wicket === "runout" ? "Runs completed" : "Runs run"}>
                <p className={label}>{draft.wicket === "runout" ? "Runs completed before the run out" : "Runs run"}</p>
                <div className="grid grid-cols-6 gap-2">
                  {runs.map((r) => (
                    <Pick key={r} on={draft.running === r} onClick={() => set({ running: r })}>
                      {draft.bonus ? `${draft.bonus}+${r}` : r}
                    </Pick>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {showStriker && (
          <div role="group" aria-label="On strike">
            <p className={label}>On strike</p>
            <div className="grid grid-cols-2 gap-2">
              {([0, 1] as const).map((i) => (
                <Pick key={i} on={draft.striker === i} onClick={() => set({ striker: i })}>
                  {batter(i)}
                </Pick>
              ))}
            </div>
            {over.female && <p className="mt-1 text-xs text-muted">Female over: one batter faces every ball, so this changes the whole over.</p>}
          </div>
        )}

        {draft.wicket === "runout" && (
          <div role="group" aria-label="Who was run out">
            <p className={label}>Who was run out</p>
            <div className="grid grid-cols-2 gap-2">
              {([0, 1] as const).map((i) => (
                <Pick key={i} on={draft.outWho === i} onClick={() => set({ outWho: i })}>
                  {batter(i)}
                </Pick>
              ))}
            </div>
          </div>
        )}

        <div aria-live="polite" className="min-h-10 text-sm">
          {now === null ? (
            <p className="text-warn">{draft.striker === null ? "Pick who was on strike." : "Pick who was run out."}</p>
          ) : result && !result.ok ? (
            <p className="text-loss">{result.error}</p>
          ) : changed ? (
            <p>
              Now <span className={`tabular rounded px-2 py-0.5 font-medium ${chipTone(now)}`}>{chip(now)}</span>
              {strikerOf(now) !== undefined && strikerOf(now) !== strikerOf(ballOf(start)) && ` · ${batter(strikerOf(now)!)} on strike`}
              <span className="text-muted">
                {" "}
                · over {at.over + 1} total {over.total} → {total}
              </span>
            </p>
          ) : (
            <p className="text-muted">Nothing changed yet.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-line py-2.5 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => now && result?.ok && onSave(at, was, now, result.events)}
            disabled={!changed || !result?.ok}
            className="rounded-md bg-accent py-2.5 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Save change
          </button>
        </div>
      </div>
    </div>
  );
}

function ScorecardView({
  card,
  teamName,
  onEdit,
}: {
  card: Scorecard;
  teamName: (t: 1 | 2) => string;
  /** Set while the match can still be corrected: each ball becomes a button. */
  onEdit?: (at: BallAt) => void;
}) {
  return (
    <section className="space-y-3">
      {onEdit && card.innings[0].overs.length > 0 && <p className="text-xs text-muted">Scored a ball wrong? Tap it here to change it, in any over.</p>}
      {card.innings.map((inn, i) =>
        inn.overs.length === 0 ? null : (
          <div key={i} className="rounded-lg border border-line bg-card p-3 text-sm shadow-sm">
            <div className="mb-2 flex justify-between font-semibold">
              <span>{teamName(inn.battingTeam)}</span>
              <span className="tabular">{inn.runs}</span>
            </div>
            <table className="tabular w-full text-xs">
              <tbody>
                {inn.overs.map((o) => (
                  <tr key={o.index} className="border-t border-line align-top">
                    <td className="w-16 py-1.5 text-muted">
                      P{o.pair + 1} · O{o.index + 1}
                      {o.female && " ♀"}
                    </td>
                    <td className="py-1.5">
                      {onEdit ? (
                        <span className="flex flex-wrap gap-1">
                          {o.balls.map((b, k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => onEdit({ innings: i as 0 | 1, over: o.index, ball: k })}
                              aria-label={`Change over ${o.index + 1}, ball ${k + 1}: ${chip(b)}`}
                              className={`min-h-8 min-w-8 rounded px-1.5 font-medium ${chipTone(b)}`}
                            >
                              {chip(b)}
                            </button>
                          ))}
                        </span>
                      ) : (
                        o.balls.map(chip).join(" ")
                      )}
                      {o.bowler && <span className="block text-muted">Bowler {o.bowler}</span>}
                    </td>
                    <td className="w-10 py-1.5 text-right font-semibold">{o.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-2 space-y-0.5 text-xs text-muted">
              {inn.pairTotals.map((total, p) =>
                inn.overs.some((o) => o.pair === p) ? (
                  <li key={p}>
                    <div className="flex justify-between gap-2">
                      <span>
                        Pair {p + 1}
                        {inn.pairs[p] && `: ${inn.pairs[p]![0]} & ${inn.pairs[p]![1]}`}
                      </span>
                      <span className="tabular">{total}</span>
                    </div>
                    {inn.batters
                      .filter((b) => b.pair === p && (b.balls > 0 || b.outs > 0))
                      .map((b) => (
                        <div key={b.name} className="tabular flex justify-between gap-2 pl-3">
                          <span className="truncate">
                            {b.name} {b.runs} ({b.balls})
                            {b.sideRuns > 0 && ` · side ${b.sideRuns}`}
                            {b.fours > 0 && ` · ${b.fours}×4`}
                            {b.sixes > 0 && ` · ${b.sixes}×6`}
                            {b.outs > 0 && ` · out ${b.outs}`}
                          </span>
                          <span>{b.net}</span>
                        </div>
                      ))}
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        ),
      )}
      {card.penalties.length > 0 && (
        <p className="text-xs text-muted">
          Penalties: {card.penalties.map((p) => `−${p.runs} ${teamName(p.team)}`).join(", ")}
        </p>
      )}
    </section>
  );
}
