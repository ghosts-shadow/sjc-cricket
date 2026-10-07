"use client";

import { useActionState, useState } from "react";
import type { MatchStatus } from "@/lib/tournament";
import { saveResult, type FormState } from "../../actions";
import { inputClass, PrimaryButton } from "../../ui";

const STATUS_OPTIONS: { value: MatchStatus; label: string }[] = [
  { value: "COMPLETED", label: "Played" },
  { value: "SCHEDULED", label: "Not played yet" },
  { value: "WALKOVER", label: "Walkover" },
  { value: "ABANDONED", label: "Abandoned (weather): 1 point each" },
  { value: "DOUBLE_FORFEIT", label: "Both teams short: 0 points each" },
  { value: "POSTPONED", label: "Postponed" },
];

interface Props {
  matchNo: number;
  knockout: boolean;
  teams: { id: number; name: string }[];
  initial: {
    status: MatchStatus;
    team1Id: number | null;
    team2Id: number | null;
    team1Label: string;
    team2Label: string;
    score1: number | null;
    score2: number | null;
    winnerId: number | null;
    note: string;
  };
}

export function ResultForm({ matchNo, knockout, teams, initial }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveResult, {});
  const [status, setStatus] = useState<MatchStatus>(initial.status === "SCHEDULED" ? "COMPLETED" : initial.status);
  const [team1Id, setTeam1Id] = useState(initial.team1Id?.toString() ?? "");
  const [team2Id, setTeam2Id] = useState(initial.team2Id?.toString() ?? "");
  const [score1, setScore1] = useState(initial.score1?.toString() ?? "");
  const [score2, setScore2] = useState(initial.score2?.toString() ?? "");

  const nameOf = (id: string, fallback: string) => teams.find((t) => t.id.toString() === id)?.name ?? fallback;
  const name1 = nameOf(team1Id, initial.team1Label);
  const name2 = nameOf(team2Id, initial.team2Label);
  const tied = score1 !== "" && score1 === score2;
  const needsWinner = status === "WALKOVER" || (status === "COMPLETED" && knockout && tied);

  return (
    <form action={action} className="space-y-4 rounded-lg border border-line bg-card p-4 shadow-sm">
      <input type="hidden" name="matchNo" value={matchNo} />

      {knockout && (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">Teams</legend>
          {[
            { name: "team1Id", value: team1Id, set: setTeam1Id, label: initial.team1Label },
            { name: "team2Id", value: team2Id, set: setTeam2Id, label: initial.team2Label },
          ].map((f) => (
            <select key={f.name} name={f.name} value={f.value} onChange={(e) => f.set(e.target.value)} className={inputClass}>
              <option value="">{f.label} (not decided)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ))}
          <p className="text-xs text-muted sm:col-span-2">
            Filled in automatically from the group tables and earlier rounds. Only change these to correct a mistake.
          </p>
        </fieldset>
      )}

      <label className="block text-sm">
        <span className="mb-1 block font-medium">What happened?</span>
        <select name="status" value={status} onChange={(e) => setStatus(e.target.value as MatchStatus)} className={inputClass}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {status === "COMPLETED" && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { name: "score1", label: name1, value: score1, set: setScore1 },
            { name: "score2", label: name2, value: score2, set: setScore2 },
          ].map((f) => (
            <label key={f.name} className="block text-sm">
              <span className="mb-1 block truncate font-medium">{f.label}</span>
              <input
                name={f.name}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                inputMode="numeric"
                pattern="-?[0-9]*"
                placeholder="Total"
                required
                className={`${inputClass} tabular text-lg`}
              />
            </label>
          ))}
        </div>
      )}

      {needsWinner && (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{status === "WALKOVER" ? "Walkover awarded to" : "Super-over winner"}</span>
          <select name="winnerId" defaultValue={initial.winnerId?.toString() ?? ""} required className={inputClass}>
            <option value="" disabled>
              Pick a team
            </option>
            {team1Id && <option value={team1Id}>{name1}</option>}
            {team2Id && <option value={team2Id}>{name2}</option>}
          </select>
        </label>
      )}

      {status === "COMPLETED" && tied && !knockout && <p className="text-sm text-muted">Level scores: recorded as a draw, 1 point each.</p>}

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Note (optional, shown publicly)</span>
        <input name="note" defaultValue={initial.note} maxLength={200} className={inputClass} />
      </label>

      {state.error && <p className="text-sm text-loss">{state.error}</p>}
      <PrimaryButton pending={pending}>Save</PrimaryButton>
    </form>
  );
}
