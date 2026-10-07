/**
 * Signed session cookie for organisers. Kept free of server-only imports so
 * proxy.ts can verify the signature without touching the database.
 */
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "sjc_session";
export const SESSION_DAYS = 30;

export interface SessionPayload {
  organiserId: number;
  name: string;
}

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.organiserId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const organiserId = Number(payload.sub);
    if (!Number.isInteger(organiserId) || typeof payload.name !== "string") return null;
    return { organiserId, name: payload.name };
  } catch {
    return null;
  }
}
