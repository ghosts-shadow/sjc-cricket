import "server-only";
import { SESSION_DAYS } from "./session-token";

/** Shared by sign-in and "Change my PIN" so both lock and issue sessions the same way. */
export const MAX_FAILED_PINS = 5;
export const LOCK_MINUTES = 15;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
