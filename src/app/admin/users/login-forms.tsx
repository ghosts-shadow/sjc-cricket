"use client";

import { useActionState, useState } from "react";
import type { FormState } from "../actions";
import { createLogin, resetPin, setActive, setRole } from "./actions";

const field = "rounded-md border border-edge bg-background px-3 py-2 text-base";
const ROLE_LABELS = { admin: "Admin", organiser: "Organiser", scorer: "Scorer" } as const;
type Role = keyof typeof ROLE_LABELS;

/** A random 6-digit PIN (100000-999999), made in the browser. */
function randomPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000;
  return String(100000 + n);
}

/** PIN box with a "Generate" button; the PIN stays visible so the admin can copy it. */
function PinInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <input
        name="pin"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 12))}
        inputMode="numeric"
        autoComplete="off"
        placeholder="6+ digit PIN"
        aria-label="PIN"
        required
        className={`tabular min-w-0 flex-1 ${field}`}
      />
      <button type="button" onClick={() => onChange(randomPin())} className="rounded-md border border-line bg-soft px-3 text-sm hover:bg-raised">
        Generate
      </button>
    </div>
  );
}

function Status({ state }: { state: FormState }) {
  if (state.error) return <p className="text-xs text-loss">{state.error}</p>;
  if (state.message) return <p className="text-xs text-win">{state.message}</p>;
  return null;
}

export function CreateLoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createLogin, {});
  const [pin, setPin] = useState("");
  return (
    <form action={action} className="space-y-3 rounded-lg border border-line bg-card p-4 text-sm shadow-sm">
      <h2 className="font-medium">New login</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="name" required maxLength={40} placeholder="Name they'll type to sign in" aria-label="Name" className={field} />
        <select name="role" defaultValue="scorer" aria-label="Role" className={field}>
          <option value="scorer">Scorer: live scoring only</option>
          <option value="organiser">Organiser: results, fixtures, contacts</option>
          <option value="admin">Admin: everything, including logins</option>
        </select>
      </div>
      <PinInput value={pin} onChange={setPin} />
      <p className="text-xs text-muted">Copy the PIN before saving. It&apos;s stored scrambled and can&apos;t be shown again.</p>
      <button disabled={pending} className="w-full rounded-md bg-accent px-4 py-2.5 font-medium text-white hover:bg-accent-hover disabled:opacity-60">
        {pending ? "Creating…" : "Create login"}
      </button>
      <Status state={state} />
    </form>
  );
}

export interface LoginRow {
  id: number;
  name: string;
  role: Role;
  active: boolean;
  locked: boolean;
  failedLogins: number;
  isMe: boolean;
}

export function LoginCard({ login }: { login: LoginRow }) {
  const [roleState, roleAction, rolePending] = useActionState<FormState, FormData>(setRole, {});
  const [pinState, pinAction, pinPending] = useActionState<FormState, FormData>(resetPin, {});
  const [activeState, activeAction, activePending] = useActionState<FormState, FormData>(setActive, {});
  const [pin, setPin] = useState("");

  return (
    <li className={`space-y-3 p-4 text-sm ${login.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {login.name}
          {login.isMe && <span className="text-muted"> (you)</span>}
        </p>
        <p className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full border border-edge bg-raised px-2 py-0.5">{ROLE_LABELS[login.role]}</span>
          {!login.active && <span className="rounded-full bg-danger-tint px-2 py-0.5 text-danger">Disabled</span>}
          {login.locked && <span className="rounded-full bg-warn-tint px-2 py-0.5 text-warn">Locked: too many wrong PINs</span>}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={roleAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={login.id} />
          <select name="role" defaultValue={login.role} disabled={login.isMe} aria-label={`Role for ${login.name}`} className={`${field} py-1.5 text-sm`}>
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {!login.isMe && (
            <button disabled={rolePending} className="rounded-md border border-line px-3 py-1.5 hover:bg-soft disabled:opacity-60">
              {rolePending ? "…" : "Save role"}
            </button>
          )}
        </form>

        {!login.isMe && (
          <form
            action={activeAction}
            onSubmit={(e) => {
              if (login.active && !window.confirm(`Disable ${login.name}? They're signed out everywhere and can't sign in until you re-enable them.`)) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="id" value={login.id} />
            <input type="hidden" name="active" value={login.active ? "false" : "true"} />
            <button
              disabled={activePending}
              className={`rounded-md border px-3 py-1.5 disabled:opacity-60 ${login.active ? "border-danger/60 text-danger hover:bg-danger-tint" : "border-line hover:bg-soft"}`}
            >
              {activePending ? "…" : login.active ? "Disable" : "Enable"}
            </button>
          </form>
        )}
      </div>

      {/* A native <details> opens instantly, even before the page's JavaScript has loaded. */}
      <details>
        <summary className="cursor-pointer text-muted underline underline-offset-2">
          {login.locked ? "Reset PIN / unlock" : "Reset PIN"}
        </summary>
        <form action={pinAction} className="mt-2 space-y-2">
          <input type="hidden" name="id" value={login.id} />
          <PinInput value={pin} onChange={setPin} />
          <button disabled={pinPending} className="w-full rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-60">
            {pinPending ? "Saving…" : `Set new PIN for ${login.name}`}
          </button>
          <p className="text-xs text-muted">This also unlocks the login and signs {login.name} out on every other device.</p>
        </form>
      </details>

      <Status state={roleState} />
      <Status state={pinState} />
      <Status state={activeState} />
    </li>
  );
}
