import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { signSession, verifySession } from "./session-token";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";
});

describe("session tokens", () => {
  it("round-trips the login id, name and session version", async () => {
    const token = await signSession({ organiserId: 7, name: "Julius", version: 3 });
    expect(await verifySession(token)).toEqual({ organiserId: 7, name: "Julius", version: 3 });
  });

  it("treats cookies issued before session versions existed as version 0, so nobody is logged out by the upgrade", async () => {
    const old = await new SignJWT({ name: "Lost" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
    expect(await verifySession(old)).toEqual({ organiserId: 1, name: "Lost", version: 0 });
  });

  it("rejects tampered or missing tokens", async () => {
    const token = await signSession({ organiserId: 7, name: "Julius", version: 0 });
    expect(await verifySession(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });
});
