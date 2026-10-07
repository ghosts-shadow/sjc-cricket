import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session-token";

/** The signed-in organiser, re-checked against the database so disabled logins stop working at once. */
export async function getOrganiser(): Promise<SessionPayload | null> {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const organiser = await prisma.organiser.findUnique({ where: { id: session.organiserId } });
  if (!organiser?.active) return null;
  return { organiserId: organiser.id, name: organiser.name };
}

/** Use at the top of every organiser page and server action. */
export async function requireOrganiser(): Promise<SessionPayload> {
  const organiser = await getOrganiser();
  if (!organiser) redirect("/admin/login");
  return organiser;
}
