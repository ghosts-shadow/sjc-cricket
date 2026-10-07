# SJC Sports Fest Cricket 2026

Official scoreboard for the SJC Sports Fest cricket tournament: fixtures, results, live standings, knockout bracket and rules, plus organiser result entry and a ball-by-ball scorer.

- Public pages: `/`, `/standings`, `/fixtures`, `/bracket`, `/teams`, `/rules`
- Organisers: `/admin` (sign in with name + PIN), `/score/<matchNo>` (live scorer)

Stack: Next.js 16 (App Router, Cache Components) · Tailwind 4 · Prisma 6 + Postgres (Neon) · Vercel.

## Privacy

The organisers' masterfile contains registration data (Emirates IDs, phones, emails). **Never commit the .xlsx** (it's gitignored), and never read the `Team` or `Ind` sheets. `scripts/extract-seed.ts` only reads `Group Draw`, `Sheet1` and `Sheet3`, and outputs team names, fixtures and scores. The site stores team names only: no player data.

## Local development

```bash
npm install
npx prisma dev -n sjc-cricket --detach   # local Postgres; prints a postgres:// URL
cp .env.example .env                     # paste that URL into DATABASE_URL, add SESSION_SECRET
npm run db:push                          # create tables
npm run db:seed                          # load prisma/seed-data.json (safe to re-run)
npm run organiser:add -- "Your Name" 123456
npm run dev
```

With the local `prisma dev` database, add `&pgbouncer=true` to the URL (it shares one Postgres session across connections).

## Deploying (first time)

1. **Database:** in Vercel, Storage → Create → Neon (free). Connect it to the project; it adds `DATABASE_URL`.
2. **Env var:** add `SESSION_SECRET` (32+ random characters, e.g. `openssl rand -base64 32`) for Production.
3. **Tables + data:** from your PC, with the Neon connection string in `.env` as `DATABASE_URL`:
   ```bash
   npm run db:push
   npm run db:seed
   npm run organiser:add -- "Organiser Name" <6+ digit PIN>   # once per organiser
   ```
4. **Deploy:** push to GitHub and import the repo in Vercel (or `npx vercel --prod`).

Pages refresh within a minute on their own, and immediately when an organiser saves a result.

## Day-to-day

- **Enter a result:** `/admin` → match → *Enter result*. Covers played, walkover, abandoned, both-short and postponed. Every save is logged with the organiser's name (shown under *Change history*).
- **Live scoring:** `/admin` → *Score live*. Every ball is saved on the phone instantly and synced to the server. *Submit result* recomputes the totals on the server and updates the public site.
- **Reschedule:** change the date/time on the match's result page.
- **Add / remove an organiser:** `npm run organiser:add -- "Name" <pin>` or `npm run organiser:add -- "Name" --disable`.

## Rules encoded

- Standings (`src/lib/tournament.ts`): win 2, draw 1, abandoned 1 each, walkover 2 to the present team, both short 0. Ranked by points, then NRR = run difference ÷ matches with a scored result (the organisers' formula), then runs scored, then draw position. Top 2 per group qualify.
- Scoring (`src/lib/scoring.ts`): wides, no-balls and dead balls with the 4th/5th/6th escalation, female-over wides (2 runs, no re-ball), −5 per dismissal, −5 misconduct penalties.

`npm test` runs the unit tests. The standings test reproduces the organisers' Day 3 table from the seeded results.
