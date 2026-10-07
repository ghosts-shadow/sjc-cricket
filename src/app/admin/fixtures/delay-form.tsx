"use client";

import { useActionState, useState } from "react";
import { delayMatches, type FormState } from "../actions";
import { inputClass, PrimaryButton } from "../ui";

export interface DelayDay {
  key: string;
  label: string;
  matches: { matchNo: number; label: string }[];
}

const QUICK = [10, 15, 20, 30];

/** "Running late": pick the day and the first match to move, then how many minutes. */
export function DelayForm({ days }: { days: DelayDay[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(delayMatches, {});
  const [dayKey, setDayKey] = useState(days[0]?.key ?? "");
  const day = days.find((d) => d.key === dayKey) ?? days[0];
  const [fromMatchNo, setFromMatchNo] = useState(String(day?.matches[0]?.matchNo ?? ""));
  const [minutes, setMinutes] = useState("15");

  if (!day) return <p className="text-sm text-muted">No unplayed matches left to move.</p>;

  const fromIndex = day.matches.findIndex((m) => String(m.matchNo) === fromMatchNo);
  const count = fromIndex < 0 ? 0 : day.matches.length - fromIndex;
  const mins = Number(minutes);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const what = `${count} match${count === 1 ? "" : "es"} on ${day.label} ${Math.abs(mins)} min ${mins > 0 ? "later" : "earlier"}`;
        if (!window.confirm(`Move ${what}?\n\nThe public site shows the new times straight away.`)) e.preventDefault();
      }}
      className="space-y-4 rounded-lg border border-line bg-card p-4 shadow-sm"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Match day</span>
          <select
            value={dayKey}
            onChange={(e) => {
              setDayKey(e.target.value);
              setFromMatchNo(String(days.find((d) => d.key === e.target.value)?.matches[0]?.matchNo ?? ""));
            }}
            className={inputClass}
          >
            {days.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Starting from</span>
          <select name="fromMatchNo" value={fromMatchNo} onChange={(e) => setFromMatchNo(e.target.value)} className={inputClass}>
            {day.matches.map((m) => (
              <option key={m.matchNo} value={m.matchNo}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="text-sm">
        <span className="mb-1 block font-medium">Move by (minutes)</span>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setMinutes(String(q))}
              className={`rounded-full border px-3.5 py-1.5 font-medium ${minutes === String(q) ? "border-edge bg-raised" : "border-line text-muted"}`}
            >
              +{q}
            </button>
          ))}
          <input
            name="minutes"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            inputMode="numeric"
            pattern="-?[0-9]*"
            aria-label="Minutes"
            className={`${inputClass} w-24`}
          />
        </div>
        <p className="mt-1 text-xs text-muted">Use a minus number (e.g. -10) to start earlier. Played matches are never moved.</p>
      </div>

      <p className="text-sm text-muted">
        {count > 0 && Number.isInteger(mins) && mins !== 0
          ? `Moves ${count} unplayed match${count === 1 ? "" : "es"} on ${day.label}.`
          : "Pick a match and a number of minutes."}
      </p>

      {state.error && <p className="text-sm text-loss">{state.error}</p>}
      {state.message && <p className="text-sm text-win">{state.message}</p>}
      <PrimaryButton pending={pending}>Apply delay</PrimaryButton>
    </form>
  );
}
