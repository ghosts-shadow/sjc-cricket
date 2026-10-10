"use client";

import { useActionState } from "react";
import type { FormState } from "../admin/actions";
import { inputClass, PrimaryButton } from "../admin/ui";
import { changeMyPin } from "./actions";

export function ChangePinForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changeMyPin, {});
  const pinField = (name: string, label: string, autoComplete: string) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        name={name}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={12}
        autoComplete={autoComplete}
        required
        className={`${inputClass} tabular`}
      />
    </label>
  );

  return (
    <form action={action} className="space-y-3 rounded-lg border border-line bg-card p-4 shadow-sm">
      {pinField("current", "Current PIN", "current-password")}
      {pinField("next", "New PIN (6 to 12 digits)", "new-password")}
      {pinField("confirm", "New PIN again", "new-password")}
      {state.error && <p className="text-sm text-loss">{state.error}</p>}
      {state.message && <p className="text-sm text-win">{state.message}</p>}
      <PrimaryButton pending={pending}>Change PIN</PrimaryButton>
    </form>
  );
}
