"use client";

import { useActionState } from "react";
import { addPlayer, placePlayer, removePlayer, type FormState } from "../actions";

export interface TeamOption {
  id: number;
  name: string;
  players: number;
}

const fieldClass = "rounded-md border border-edge bg-background px-3 py-2 text-base";

/** "Add to team" for one individual registration. Teams with no players are listed first. */
export function PlaceForm({ playerId, teams }: { playerId: number; teams: TeamOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(placePlayer, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="playerId" value={playerId} />
      <select name="teamId" defaultValue="" required aria-label="Team" className={`min-w-0 flex-1 ${fieldClass}`}>
        <option value="" disabled>
          Add to team…
        </option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.players === 0 ? " (no players yet)" : ` (${t.players})`}
          </option>
        ))}
      </select>
      <button disabled={pending} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60">
        {pending ? "Adding…" : "Add"}
      </button>
      {state.error && <p className="w-full text-xs text-loss">{state.error}</p>}
    </form>
  );
}

/** Type a new player into a team (name, optional gender). */
export function AddPlayerForm({ teamId }: { teamId: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addPlayer, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input name="name" required maxLength={40} placeholder="Player name" aria-label="Player name" className={`min-w-0 flex-1 ${fieldClass}`} />
      <select name="gender" defaultValue="" aria-label="Gender" className={fieldClass}>
        <option value="">–</option>
        <option value="M">M</option>
        <option value="F">F</option>
      </select>
      <button disabled={pending} className="rounded-md border border-line bg-soft px-3 py-2 text-sm font-medium hover:bg-raised disabled:opacity-60">
        {pending ? "Adding…" : "Add player"}
      </button>
      {state.error && <p className="w-full text-xs text-loss">{state.error}</p>}
      {state.message && <p className="w-full text-xs text-win">{state.message}</p>}
    </form>
  );
}

/** Remove a player who wasn't on the team's registration form. */
export function RemoveButton({ playerId, name, individual }: { playerId: number; name: string; individual: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(removePlayer, {});
  const question = individual
    ? `Take ${name} off this team? They go back to the individual registrations list.`
    : `Delete ${name} from this team?`;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(question)) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="playerId" value={playerId} />
      <button disabled={pending} className="text-xs text-muted underline underline-offset-2 disabled:opacity-60">
        {pending ? "…" : "remove"}
      </button>
      {state.error && <span className="ml-1 text-xs text-loss">{state.error}</span>}
    </form>
  );
}
