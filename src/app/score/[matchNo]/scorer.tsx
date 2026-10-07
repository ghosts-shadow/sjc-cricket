"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import {
  cleanName,
  MAX_NAME_LENGTH,
  namesBySide,
  OVERS_PER_INNINGS,
  replay,
  type Ball,
  type OverCard,
  type PairNames,
  type Scorecard,
  type ScoreEvent,
  type ScoringSetup,
} from "@/lib/scoring";
import { submitScoring, syncScoring } from "../actions";

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

const RUN_BUTTONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export function chip(ball: Ball): string {
  switch (ball.t) {
    case "run":
      return String(ball.runs);
    case "out":
      return "W";
    case "wd":
      return "Wd";
    case "db":
      return "Db";
    case "nb":
      return ball.runs ? `Nb+${ball.runs}` : "Nb";
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
  const [submitted, setSubmitted] = useState(initial.submitted);
  const [superOver, setSuperOver] = useState<1 | 2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Names added on this phone that haven't been used in an event yet.
  const [added, setAdded] = useState<Rosters>({ 1: [], 2: [] });
  const [editingPlayers, setEditingPlayers] = useState(false);
  const [submitting, startSubmit] = useTransition();
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
    setNbPending(false);
    setEditingPlayers(false);
    setError(null);
  };
  const push = (event: ScoreEvent) => pushMany([event]);
  const ball = (b: Ball) => push({ type: "ball", ball: b });
  const undo = () => {
    change((d) => ({ setup: d.setup, events: d.events.slice(0, -1) }));
    setNbPending(false);
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
  const savePlayers = (batters: PairNames | null, bowler: string) => {
    const more: ScoreEvent[] = [];
    if (batters && (batters[0] !== pairNames?.[0] || batters[1] !== pairNames?.[1])) {
      more.push({ type: "batters", names: batters });
    }
    if (bowler !== bowlerName) more.push({ type: "bowler", name: bowler });
    pushMany(more);
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

      <TotalsBar card={card} team1={team1} team2={team2} />

      {submitted && (
        <div className="rounded-lg border border-win/50 bg-win-tint p-4 text-sm">
          <p className="font-semibold">Result submitted. The public site is updated.</p>
          <Link href="/admin" className="mt-2 inline-block underline underline-offset-2">
            ← All matches
          </Link>
        </div>
      )}

      {!submitted && innings && battingTeam && (
        <section className="space-y-3 rounded-lg border border-line bg-card p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted">
                Innings {inningsIndex! + 1} · {teamName(battingTeam)} batting
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
              <OverLine over={openOver} />
              {nbPending ? (
                <div>
                  <p className="mb-2 text-sm font-medium">No-ball: runs off the bat?</p>
                  <div className="grid grid-cols-5 gap-2">
                    {[0, 1, 2, 3, 4, 5, 6].map((r) => (
                      <BigButton key={r} onClick={() => ball({ t: "nb", runs: r })}>
                        {r}
                      </BigButton>
                    ))}
                    <BigButton tone="muted" onClick={() => setNbPending(false)}>
                      Cancel
                    </BigButton>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {RUN_BUTTONS.map((r) => (
                      <BigButton key={r} onClick={() => ball({ t: "run", runs: r })}>
                        {r}
                      </BigButton>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <BigButton tone="danger" onClick={() => ball({ t: "out" })}>
                      OUT
                    </BigButton>
                    <BigButton tone="extra" onClick={() => ball({ t: "wd" })}>
                      WD
                    </BigButton>
                    <BigButton tone="extra" onClick={() => setNbPending(true)}>
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
      {card.warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-warn/40 bg-warn-tint p-3 text-sm">
          {card.warnings.map((w) => (
            <li key={w}>⚠ {w.replace(/^Team (1|2)/, (_, t) => teamName(Number(t) as 1 | 2))}</li>
          ))}
        </ul>
      )}

      <ScorecardView card={card} teamName={teamName} />
    </div>
  );
}

function Header({ label, team1, team2, sync }: { label: string; team1: string; team2: string; sync?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <Link href="/admin" className="underline underline-offset-2">
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

function OverLine({ over }: { over: OverCard | null }) {
  if (!over || over.balls.length === 0) return <p className="text-sm text-muted">New over: tap the first ball.</p>;
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {over.balls.map((b, i) => (
          <span
            key={i}
            className={`tabular rounded px-2 py-1 text-sm font-medium ${
              b.t === "out" ? "bg-danger text-card" : b.t === "run" ? "bg-soft" : "bg-warn-tint text-warn"
            }`}
          >
            {chip(b)}
          </span>
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

/** A roster dropdown whose last option, "+ Add player…", turns it into a name box. */
function NamePicker({
  label,
  options,
  value,
  exclude,
  onChange,
  onAdd,
}: {
  label: string;
  options: string[];
  value: string | null;
  /** A name taken by the other picker (the other batter), shown but not selectable. */
  exclude?: string | null;
  onChange: (name: string) => void;
  onAdd: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const name = cleanName(draft);
    if (!name) return;
    const existing = options.find((o) => sameName(o, name));
    if (!existing) onAdd(name);
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
        {options.map((name) => (
          <option key={name} value={name} disabled={sameName(name, exclude ?? null)}>
            {name}
          </option>
        ))}
        <option value={ADD_PLAYER}>+ Add player…</option>
      </select>
    </label>
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
  askBatters: boolean;
  onAdd: (side: "bat" | "bowl", name: string) => void;
  onSave: (batters: PairNames | null, bowler: string) => void;
  onCancel?: () => void;
}) {
  const [b1, setB1] = useState<string | null>(pair?.[0] ?? null);
  const [b2, setB2] = useState<string | null>(pair?.[1] ?? null);
  const [bowl, setBowl] = useState<string | null>(bowler);
  const battersOk = !askBatters || (b1 != null && b2 != null && !sameName(b1, b2));
  const ready = battersOk && bowl != null;

  return (
    <div className="space-y-3 rounded-md border border-edge bg-raised p-3">
      <p className="text-sm font-medium">{title}</p>
      {askBatters ? (
        <>
          <NamePicker label={`Batter 1 · ${battingTeam}`} options={batRoster} value={b1} exclude={b2} onChange={setB1} onAdd={(n) => onAdd("bat", n)} />
          <NamePicker label={`Batter 2 · ${battingTeam}`} options={batRoster} value={b2} exclude={b1} onChange={setB2} onAdd={(n) => onAdd("bat", n)} />
        </>
      ) : (
        pair && (
          <p className="text-sm">
            <span className="text-muted">Batting</span> {pair[0]} &amp; {pair[1]}
          </p>
        )
      )}
      <NamePicker label={`Bowler · ${fieldingTeam}`} options={bowlRoster} value={bowl} onChange={setBowl} onAdd={(n) => onAdd("bowl", n)} />
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
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "run" | "danger" | "extra" | "muted";
}) {
  const tones = {
    run: "bg-soft border-line",
    danger: "bg-danger text-card border-danger",
    extra: "bg-warn-tint text-warn border-warn/40",
    muted: "bg-card border-line text-sm",
  };
  return (
    <button onClick={onClick} className={`min-h-14 rounded-md border font-display text-2xl font-semibold active:scale-95 ${tones[tone]}`}>
      {children}
    </button>
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

function ScorecardView({ card, teamName }: { card: Scorecard; teamName: (t: 1 | 2) => string }) {
  return (
    <section className="space-y-3">
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
                      {o.balls.map(chip).join(" ")}
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
                  <li key={p} className="flex justify-between gap-2">
                    <span>
                      Pair {p + 1}
                      {inn.pairs[p] && `: ${inn.pairs[p]![0]} & ${inn.pairs[p]![1]}`}
                    </span>
                    <span className="tabular">{total}</span>
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
