import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session-token";

/** "organiser" can do everything; "scorer" can only use the live scorer. */
export type Role = "organiser" | "scorer";

export interface SignedIn extends SessionPayload {
  role: Role;
}

/** The signed-in person, re-checked against the database so disabled logins stop working at once. */
export async function getOrganiser(): Promise<SignedIn | null> {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const organiser = await prisma.organiser.findUnique({ where: { id: session.organiserId } });
  if (!organiser?.active) return null;
  return { organiserId: organiser.id, name: organiser.name, role: organiser.role === "scorer" ? "scorer" : "organiser" };
}

/** Organisers only: results, fixtures, contacts. Scorers are sent to their match list. */
export async function requireOrganiser(): Promise<SignedIn> {
  const signedIn = await getOrganiser();
  if (!signedIn) redirect("/admin/login");
  if (signedIn.role !== "organiser") redirect("/score");
  return signedIn;
}

/** Anyone signed in (organiser or scorer): the live scorer. */
export async function requireScorer(): Promise<SignedIn> {
  const signedIn = await getOrganiser();
  if (!signedIn) redirect("/admin/login");
  return signedIn;
}
