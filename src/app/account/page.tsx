import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireScorer } from "@/lib/auth";
import { ChangePinForm } from "./pin-form";

export const metadata: Metadata = { title: "Change my PIN", robots: { index: false } };

export default function AccountPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  const me = await requireScorer();
  const back = me.role === "scorer" ? { href: "/score", label: "← Live scoring" } : { href: "/admin", label: "← All matches" };
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <div>
        <Link href={back.href} className="text-xs text-muted underline underline-offset-2">
          {back.label}
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">Change my PIN</h1>
        <p className="mt-1 text-sm text-muted">
          Signed in as {me.name}. Pick a PIN only you know. Changing it signs you out on your other devices.
        </p>
      </div>
      <ChangePinForm />
    </div>
  );
}
