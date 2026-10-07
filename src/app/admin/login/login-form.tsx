"use client";

import { useActionState } from "react";
import { login, type FormState } from "../actions";
import { inputClass, PrimaryButton } from "../ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="space-y-3 rounded-lg border border-line bg-card p-4 shadow-sm">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Name</span>
        <input name="name" autoComplete="username" required className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">PIN</span>
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </label>
      {state.error && <p className="text-sm text-loss">{state.error}</p>}
      <PrimaryButton pending={pending}>Sign in</PrimaryButton>
    </form>
  );
}
