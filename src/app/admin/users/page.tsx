import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAdmin, toRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CreateLoginForm, LoginCard, type LoginRow } from "./login-forms";

export const metadata: Metadata = { title: "Logins", robots: { index: false } };

export default function UsersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Users />
    </Suspense>
  );
}

const ROLE_ORDER = { admin: 0, organiser: 1, scorer: 2 } as const;

async function Users() {
  const me = await requireAdmin();
  await connection();
  const now = new Date();
  const logins = await prisma.organiser.findMany({ orderBy: { name: "asc" } });
  const rows: LoginRow[] = logins
    .map((l) => ({
      id: l.id,
      name: l.name,
      role: toRole(l.role),
      active: l.active,
      locked: l.lockedUntil != null && l.lockedUntil > now,
      failedLogins: l.failedLogins,
      isMe: l.id === me.organiserId,
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/admin" className="text-xs text-muted underline underline-offset-2">
          ← All matches
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">Logins</h1>
        <p className="mt-1 text-sm text-muted">
          Who can sign in, and what they can do. Scorers only get live scoring. Send each person their name and PIN privately.
        </p>
      </div>

      <CreateLoginForm />

      <section>
        <h2 className="mb-2 font-display text-xl font-semibold">Everyone ({rows.filter((r) => r.active).length} active)</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card shadow-sm">
          {rows.map((row) => (
            <LoginCard key={`${row.id}-${row.role}-${row.active}`} login={row} />
          ))}
        </ul>
      </section>
    </div>
  );
}
