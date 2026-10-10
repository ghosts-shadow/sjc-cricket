"use server";

import bcrypt from "bcryptjs";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { requireScorer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LOCK_MINUTES, MAX_FAILED_PINS, SESSION_COOKIE_OPTIONS } from "@/lib/session-cookie";
import { SESSION_COOKIE, signSession } from "@/lib/session-token";
import type { FormState } from "../admin/actions";

const PIN = /^\d{6,12}$/;

/**
 * Anyone signed in changes their own PIN. Needs the current PIN (wrong ones count towards the same
 * 5-tries lock as sign-in). Signs out every other device; this one gets a fresh session.
 */
export async function changeMyPin(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireScorer();
  // Mark the page for re-render. Without this, Next renders a no-JavaScript form submit while still
  // in the "action" phase, so the render would read the OLD session cookie (and in dev, throw an
  // InvariantError). With it, Next copies the new cookie set below into the render.
  refresh();
  const current = String(formData.get("current") ?? "").trim();
  const next = String(formData.get("next") ?? "").trim();
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (!PIN.test(next)) return { error: "The new PIN must be 6 to 12 digits." };
  if (next !== confirm) return { error: "The two new PINs don't match." };
  if (next === current) return { error: "The new PIN is the same as the current one." };

  const login = await prisma.organiser.findUnique({ where: { id: me.organiserId } });
  if (!login) return { error: "Login not found." };
  if (login.lockedUntil && login.lockedUntil > new Date()) {
    return { error: `Too many wrong PINs. Try again after ${LOCK_MINUTES} minutes.` };
  }
  if (!(await bcrypt.compare(current, login.pinHash))) {
    const failed = login.failedLogins + 1;
    await prisma.organiser.update({
      where: { id: login.id },
      data:
        failed >= MAX_FAILED_PINS
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
          : { failedLogins: failed },
    });
    return { error: "Your current PIN is wrong." };
  }

  const updated = await prisma.organiser.update({
    where: { id: login.id },
    data: { pinHash: await bcrypt.hash(next, 10), failedLogins: 0, lockedUntil: null, sessionVersion: { increment: 1 } },
  });
  // The bump above signs out other devices; keep this one signed in with a fresh session.
  const token = await signSession({ organiserId: updated.id, name: updated.name, version: updated.sessionVersion });
  (await cookies()).set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  return { message: "PIN changed. Use the new one next time you sign in. Your other devices are signed out." };
}
