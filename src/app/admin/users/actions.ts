"use server";

import bcrypt from "bcryptjs";
import { refresh } from "next/cache";
import { requireAdmin, ROLES, type Role } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cleanName } from "@/lib/scoring";
import type { FormState } from "../actions";

const PIN = /^\d{6,12}$/;

function readRole(formData: FormData): Role | null {
  const role = String(formData.get("role") ?? "");
  return ROLES.includes(role as Role) ? (role as Role) : null;
}

function readId(formData: FormData): number | null {
  const id = Number(formData.get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** New login: name, role and a PIN the admin sends to the person privately. */
export async function createLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const name = cleanName(formData.get("name"));
  const role = readRole(formData);
  const pin = String(formData.get("pin") ?? "").trim();
  if (!name) return { error: "Type a name." };
  if (!role) return { error: "Pick a role." };
  if (!PIN.test(pin)) return { error: "The PIN must be 6 to 12 digits." };
  const taken = await prisma.organiser.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (taken) return { error: `There's already a login called ${taken.name}. Reset its PIN below instead.` };
  await prisma.organiser.create({ data: { name, role, pinHash: await bcrypt.hash(pin, 10) } });
  refresh();
  return { message: `Login created for ${name}. Send them the name and PIN privately.` };
}

/** New PIN; also unlocks, re-enables and signs the person out everywhere. */
export async function resetPin(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = readId(formData);
  const pin = String(formData.get("pin") ?? "").trim();
  if (id == null) return { error: "Login not found." };
  if (!PIN.test(pin)) return { error: "The PIN must be 6 to 12 digits." };
  const login = await prisma.organiser.update({
    where: { id },
    data: { pinHash: await bcrypt.hash(pin, 10), failedLogins: 0, lockedUntil: null, active: true, sessionVersion: { increment: 1 } },
  });
  refresh();
  return { message: `New PIN set for ${login.name}. Their other sessions are signed out.` };
}

export async function setRole(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const id = readId(formData);
  const role = readRole(formData);
  if (id == null || !role) return { error: "Pick a role." };
  if (id === me.organiserId && role !== "admin") return { error: "You can't remove your own admin role." };
  await prisma.organiser.update({ where: { id }, data: { role } });
  refresh();
  return {};
}

/** Disable (signs them out everywhere) or re-enable a login. Logins are never deleted: history keeps their name. */
export async function setActive(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const id = readId(formData);
  const active = formData.get("active") === "true";
  if (id == null) return { error: "Login not found." };
  if (id === me.organiserId && !active) return { error: "You can't disable your own login." };
  await prisma.organiser.update({
    where: { id },
    data: active ? { active: true } : { active: false, sessionVersion: { increment: 1 } },
  });
  refresh();
  return {};
}
