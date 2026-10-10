import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session-token";

/** "admin": everything plus managing logins. "organiser": results, fixtures, contacts. "scorer": live scoring only. */
export type Role = "admin" | "organiser" | "scorer";
export const ROLES: Role[] = ["admin", "organiser", "scorer"];

export const toRole = (value: string): Role => (ROLES.includes(value as Role) ? (value as Role) : "organiser");

export interface SignedIn extends SessionPayload {
  role: Role;
}

/**
 * The signed-in person, re-checked against the database on every request: disabled logins, role
 * changes and PIN resets (which bump sessionVersion) take effect at once on every device.
 */
export async function getOrganiser(): Promise<SignedIn | null> {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const organiser = await prisma.organiser.findUnique({ where: { id: session.organiserId } });
  if (!organiser?.active || organiser.sessionVersion !== session.version) return null;
  return { organiserId: organiser.id, name: organiser.name, version: organiser.sessionVersion, role: toRole(organiser.role) };
}

/** Organisers and admins: results, fixtures, contacts. Scorers are sent to their match list. */
export async function requireOrganiser(): Promise<SignedIn> {
  const signedIn = await getOrganiser();
  if (!signedIn) redirect("/admin/login");
  if (signedIn.role === "scorer") redirect("/score");
  return signedIn;
}

/** Admins only: managing logins. */
export async function requireAdmin(): Promise<SignedIn> {
  const signedIn = await requireOrganiser();
  if (signedIn.role !== "admin") redirect("/admin");
  return signedIn;
}

/** Anyone signed in (admin, organiser or scorer): the live scorer. */
export async function requireScorer(): Promise<SignedIn> {
  const signedIn = await getOrganiser();
  if (!signedIn) redirect("/admin/login");
  return signedIn;
}
