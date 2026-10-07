import type { Metadata } from "next";
import Link from "next/link";
import { GroupBadge } from "@/components/cricket";
import { getTournament } from "@/lib/data";
import { GROUPS } from "@/lib/tournament";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage() {
  const { teams } = await getTournament();
  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-bold leading-none sm:text-5xl">Teams</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <section key={g} className="rounded-lg border border-line bg-card p-3 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold leading-none">
              <GroupBadge group={g} /> Group {g}
            </h2>
            <ul className="divide-y divide-line text-sm">
              {teams
                .filter((t) => t.group === g)
                .map((t) => (
                  <li key={t.id}>
                    <Link href={`/teams/${t.slug}`} className="block py-2 hover:underline">
                      {t.name}
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
