import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GroupBadge } from "@/components/cricket";
import { requireOrganiser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AddPlayerForm, PlaceForm, RemoveButton, type TeamOption } from "./place-forms";

export const metadata: Metadata = { title: "Team contacts", robots: { index: false } };

export default function ContactsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Contacts />
    </Suspense>
  );
}

/** Some cells hold two numbers ("050… 055…"): links use the first one. UAE mobiles first, then any number. */
function firstPhone(cell: string): string | null {
  const uaeMobile = cell.match(/(?:\+971|00971|971|0)[\s-]?5\d(?:[\s-]?\d){7}/);
  if (uaeMobile) return uaeMobile[0].trim();
  const part = cell.split(/[/,;|&\n]|\bor\b/i).find((p) => p.replace(/\D/g, "").length >= 7);
  return part ? part.trim() : null;
}

/** wa.me needs the international number without "+"; UAE mobiles are often written 05x xxx xxxx. */
function whatsappNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.length === 10 && digits.startsWith("05")) digits = `971${digits.slice(1)}`;
  else if (digits.length === 9 && digits.startsWith("5")) digits = `971${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** Call / WhatsApp / Email buttons for one person. */
function ContactButtons({ phoneCell, email }: { phoneCell: string | null; email: string | null }) {
  const phone = phoneCell ? firstPhone(phoneCell) : null;
  const wa = phone ? whatsappNumber(phone) : null;
  if (!phone && !email) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {phone && (
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="rounded-md border border-line bg-soft px-3 py-1.5">
          Call {phone}
        </a>
      )}
      {wa && (
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-line bg-soft px-3 py-1.5">
          WhatsApp
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className="rounded-md border border-line bg-soft px-3 py-1.5">
          Email
        </a>
      )}
    </div>
  );
}

async function Contacts() {
  await requireOrganiser();
  const [teams, unplaced] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ group: "asc" }, { drawPos: "asc" }],
      include: { players: { orderBy: { name: "asc" } } },
    }),
    prisma.player.findMany({ where: { teamId: null }, orderBy: { name: "asc" } }),
  ]);
  // For "Add to team": teams with no players first, then the rest, each alphabetically.
  const teamOptions: TeamOption[] = teams
    .map((t) => ({ id: t.id, name: t.name, players: t.players.length }))
    .sort((a, b) => Number(a.players > 0) - Number(b.players > 0) || a.name.localeCompare(b.name));
  const emptyTeams = teamOptions.filter((t) => t.players === 0).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-xs text-muted underline underline-offset-2">
          ← All matches
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">Team contacts</h1>
        <p className="mt-1 text-sm text-muted">
          Captains and individual sign-ups from the registration forms. Organisers only: never share this page or screenshot it into a group.
        </p>
      </div>

      {unplaced.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Individual registrations</h2>
            <p className="text-sm text-muted">
              {unplaced.length} signed up without a team
              {emptyTeams === 1 && ". 1 team has no players yet and is listed first"}
              {emptyTeams > 1 && `. ${emptyTeams} teams have no players yet and are listed first`}.
            </p>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card text-sm shadow-sm">
            {unplaced.map((p) => (
              <li key={p.id} className="space-y-2 p-3">
                <p className="font-medium">
                  {p.name}
                  {p.female && <span className="text-muted"> ♀</span>}
                </p>
                <ContactButtons phoneCell={p.phone} email={p.email} />
                <PlaceForm playerId={p.id} teams={teamOptions} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {teams.map((team) => {
          const phone = team.captainPhone ? firstPhone(team.captainPhone) : null;
          const female = team.players.filter((p) => p.female).length;
          return (
            <section key={team.id} className="rounded-lg border border-line bg-card p-4 text-sm shadow-sm">
              <h2 className="flex items-center gap-2 font-semibold">
                <GroupBadge group={team.group} />
                {team.name}
              </h2>

              {team.captainName || team.captainPhone || team.captainEmail ? (
                <div className="mt-3 space-y-2">
                  <p>
                    <span className="text-muted">Captain</span> {team.captainName ?? "not given"}
                    {team.captainPhone && phone !== team.captainPhone && (
                      <span className="block text-xs text-muted">Phone on form: {team.captainPhone}</span>
                    )}
                  </p>
                  <ContactButtons phoneCell={team.captainPhone} email={team.captainEmail} />
                </div>
              ) : (
                <p className="mt-3 text-muted">No captain contact on the registration form.</p>
              )}

              {team.players.length === 0 ? (
                <div className="mt-3 space-y-2">
                  <p className="text-warn">
                    No players yet. Type them in below{unplaced.length > 0 ? ", or add them from Individual registrations above" : ""}.
                  </p>
                  <AddPlayerForm teamId={team.id} />
                </div>
              ) : (
                <details className="mt-3">
                  <summary className="cursor-pointer text-muted">
                    {team.players.length} player{team.players.length === 1 ? "" : "s"}
                    {female > 0 && ` · ${female} female`}
                  </summary>
                  <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                    {team.players.map((p) => (
                      <li key={p.id} className="truncate">
                        {p.name}
                        {p.female && <span className="text-muted"> ♀</span>}
                        {p.source !== "form" && (
                          <>
                            {" "}
                            <RemoveButton playerId={p.id} name={p.name} individual={p.source === "individual"} />
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3">
                    <AddPlayerForm teamId={team.id} />
                  </div>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
