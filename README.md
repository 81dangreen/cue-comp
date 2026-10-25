# Cue Comp

Tournament management and live scoring for pool, snooker and billiards: a CueScore-style competition platform.

## Quick start

```bash
npm install
cp .env.example .env          # then set SESSION_PASSWORD to a random 32+ char string
npm run db:start              # local Postgres on :5433 (leave running in its own terminal)
npx prisma migrate deploy     # create the tables
npm run db:seed               # optional demo data (admin@example.com / password123)
npm run dev
```

Without seed data, open http://localhost:3000 and follow **Get started** to create your organisation and owner account.

| Script | |
| --- | --- |
| `npm run db:start` | Local Postgres (embedded, no install needed; data in `.pgdata/`) |
| `npm run dev` | Dev server |
| `npm test` | Unit tests (bracket engine, standings, placings) |
| `npm run typecheck` | Route types + `tsc` |
| `npm run db:reset` | Wipe the database and re-seed |

## What's in phase 1

- **Organiser area** (`/admin`): players (add, edit, bulk import), venues and tables, tournaments.
- **Formats**: single elimination, double elimination (optional grand-final reset), round robin, groups → knockout.
  Seeded brackets with automatic byes; random or manual seeding.
- **Entries**: add from the player database, quick-add new players, public self-registration with organiser confirmation, entry caps.
- **Control room**: live / ready / finished queues, table assignment (manual or auto-assign to free tables), result correction.
- **Live scoring** (`/score/:matchId`): full-screen, touch-friendly, rack-by-rack with break-and-run, undo, hill indicator.
  Scores push to every open page via Server-Sent Events.
- **Public site**: tournament directory, overview (live now, up next, latest results, final standings), bracket, group tables, match list, players, player profiles with stats.
- **Table tablets** (`/table`): a paired tablet per table loads its matches automatically; see below.
- **Stream overlay** (`/overlay/:tableId`): transparent lower-third for OBS browser sources, following whatever is on that table.

## Table tablets (on-the-day scoring)

Put a tablet on each table and let players score their own matches.

1. **Pair once.** Admin → Venues → your venue → *Table tablets* → **Pair a tablet**. Scan the QR code with the tablet
   (or open `/table` on it and type the 6-character code). Codes expire after 10 minutes and work once.
   The tablet is now that table's scoreboard. It has no admin access and can only score matches on its table.
2. **Matches arrive automatically.** Assign a match to the table in the control room, or turn on **Auto-pilot**,
   which puts the next ready match on each table as soon as it frees up. The tablet switches to it within a second.
3. **Players score it.** Pick who breaks, tap a player to add a rack, undo mistakes. The winning rack asks for
   confirmation; after that, corrections are made by the organiser from the control room.
4. **Unattended-friendly.** The screen stays awake, the page re-syncs after a wifi drop (with a warning banner while
   offline), and it can be added to the home screen to run full screen.

Unpair a lost tablet from the venue page. Tablets reach the server over the venue network, so the QR code uses this
computer's network address when you browse the admin on `localhost`. For a real event, run a production build
(`npm run build && npm start`) rather than the dev server.

## Deploying (Railway)

The app runs as **one always-on Node server plus Postgres**. Live updates are passed around inside the server process,
so run a single instance (no autoscaling / replicas) until `src/lib/events.ts` moves to a shared pub/sub.

1. Push this repo to a private GitHub repository.
2. In Railway: **New project → Deploy from GitHub repo**, pick the repo. Then **+ New → Database → PostgreSQL**.
3. On the app service, **Variables**:
   - `DATABASE_URL` = reference the Postgres service's `DATABASE_URL`
   - `SESSION_PASSWORD` = a random 64-character string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `SETUP_KEY` = any secret phrase; needed once to create the owner account
   - `NEXT_PUBLIC_APP_NAME` (optional)
4. **Settings → Networking → Generate domain** (or add your own domain and the CNAME record it shows).
   Optionally set the healthcheck path to `/api/health`.
5. Open the site, go to **Get started**, enter the setup key, and create your organisation.

`npm start` applies pending database migrations before starting, so every deploy updates the schema automatically.
Set a usage limit under the workspace's billing settings so costs can't run away.

**Hardening in place:** setup requires `SETUP_KEY` in production; login, setup and tablet pairing are rate limited;
cookies are `Secure` behind HTTPS; standard security headers (no framing except stream overlays).

## Architecture

- **Next.js 16** App Router with Cache Components. Data reads sit inside `<Suspense>`, mutations are Server Actions that call `refresh()`.
- **Prisma + Postgres**: embedded Postgres locally (`npm run db:start`), managed Postgres in production.
- `src/lib/bracket.ts`: pure draw generation (seeding, byes, double-elim losers-bracket wiring, round robin, group distribution).
- `src/lib/engine-core.ts`: pure match progression (advance winner/loser, bye pass-through, grand-final reset, reopening results).
  Tests play out thousands of random tournaments, including mid-event corrections.
- `src/lib/tournament-service.ts`: loads a tournament's matches, applies the engine and persists the changes in one transaction.
- `src/lib/auth.ts`: data access layer. Every action re-checks the session and that the record belongs to the user's organisation.
- `src/lib/device.ts`: tablet pairing and device cookies (`cs_device`), separate from user logins.
- `src/lib/events.ts`: in-process pub/sub behind `/api/live`. For more than one server instance, replace it with Redis or Postgres `LISTEN/NOTIFY`.

**Multi-tenancy:** every record is scoped by `organizationId`, and users belong to organisations through `Membership` with roles (OWNER / ADMIN / SCORER).
Today the first membership is the active organisation. Opening it to other organisers means adding sign-up, an org switcher and per-org public URLs. No schema rewrite is needed.

## Roadmap ideas

- Leagues: teams, divisions, fixture generation, match nights, league tables
- Player ratings (Elo / Fargo-style) recalculated from results
- Invite organisers and scorers
- Per-discipline break rules (alternate / winner breaks) shown on the tablet
- Payments for entry fees, check-in, printable brackets, calendar export
- Per-discipline scoring (snooker points, carom innings)
