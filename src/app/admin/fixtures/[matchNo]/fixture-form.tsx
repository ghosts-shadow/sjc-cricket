"use client";

import { useActionState } from "react";
import { saveFixture, swapSlots, type FormState } from "../../actions";
import { inputClass, PrimaryButton } from "../../ui";

interface Option {
  id: number;
  name: string;
}

/** Date, time, teams (group matches) and the public note for one fixture. */
export function FixtureForm({
  matchNo,
  groupTeams,
  teamsLocked,
  initial,
}: {
  matchNo: number;
  /** Teams in this match's group; null for knockout matches (their teams come from the bracket). */
  groupTeams: Option[] | null;
  /** True once a result is in: teams can't change until it's set back to "Not played yet". */
  teamsLocked: boolean;
  initial: { date: string; time: string; team1Id: number | null; team2Id: number | null; note: string };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveFixture, {});

  return (
    <form action={action} className="space-y-4 rounded-lg border border-line bg-card p-4 shadow-sm">
      <input type="hidden" name="matchNo" value={matchNo} />

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Date</span>
          <input type="date" name="date" defaultValue={initial.date} required className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Start (UAE)</span>
          <input type="time" name="time" defaultValue={initial.time} required className={inputClass} />
        </label>
      </div>

      {groupTeams && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Teams</legend>
          {(["team1Id", "team2Id"] as const).map((field) => (
            <select
              key={field}
              name={field}
              defaultValue={initial[field] ?? ""}
              disabled={teamsLocked}
              required
              className={`${inputClass} disabled:opacity-60`}
            >
              <option value="" disabled>
                Pick a team
              </option>
              {groupTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ))}
          {teamsLocked ? (
            <>
              {/* Disabled selects aren't submitted, so send the current teams unchanged. */}
              <input type="hidden" name="team1Id" value={initial.team1Id ?? ""} />
              <input type="hidden" name="team2Id" value={initial.team2Id ?? ""} />
              <p className="text-xs text-muted">This match has a result, so its teams are locked.</p>
            </>
          ) : (
            <p className="text-xs text-muted">Only teams from this group. Standings follow whoever is entered here.</p>
          )}
        </fieldset>
      )}

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Note (optional, shown publicly)</span>
        <input name="note" defaultValue={initial.note} maxLength={200} placeholder="e.g. Moved to Ground 2" className={inputClass} />
      </label>

      {state.error && <p className="text-sm text-loss">{state.error}</p>}
      <PrimaryButton pending={pending}>Save fixture</PrimaryButton>
    </form>
  );
}

/** Swap time slots with another unplayed match. */
export function SwapForm({ matchNo, options }: { matchNo: number; options: { matchNo: number; label: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(swapSlots, {});
  if (options.length === 0) return null;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Swap the two matches' times? Both show the change publicly.")) e.preventDefault();
      }}
      className="space-y-3 rounded-lg border border-line bg-card p-4 shadow-sm"
    >
      <input type="hidden" name="matchNo" value={matchNo} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Swap time slot with</span>
        <select name="otherMatchNo" defaultValue="" required className={inputClass}>
          <option value="" disabled>
            Pick a match
          </option>
          {options.map((o) => (
            <option key={o.matchNo} value={o.matchNo}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {state.error && <p className="text-sm text-loss">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md border border-line bg-soft px-4 py-2.5 font-medium hover:bg-raised disabled:opacity-60"
      >
        {pending ? "Swapping…" : "Swap times"}
      </button>
    </form>
  );
}
