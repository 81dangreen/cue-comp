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

Tablets are paired and unpaired only from the admin (the tablet has no unpair button, so a stray tap can't take a table offline). Unpair a lost tablet from the venue page. Tablets reach the server over the venue network, so the QR code uses this
computer's network address when you browse the admin on `localhost`. For a real event, run a production build
(`npm run build && npm start`) rather than the dev server.

## Player directory

Players live in **one directory shared by every organiser and venue**, so a person's record, ranks and competition
history follow them everywhere.

- **Directory admins** (`User.directoryAdmin`; the first account on a new install) edit players and contact details,
  set ranks individually or in bulk, merge duplicates and bulk-import.
- **Organisers** search the directory, enter anyone into their comps, and add missing players (a same-name check asks
  them to confirm it's a different person). They see ranks but can't change them, except as a **comp-only override** on
  a tournament's entries page, which never touches the player's ranking.
- **Contact details** on the directory record are visible to directory admins only. Details a player gives when
  self-registering are stored on that entry, for that comp's organisers.

## Team: invites and passwords

Everything works by **shareable links**; no email service is needed. Links are single-use and only their hash is stored.

- **Invite** (Admin → Team): pick a role, create a link, send it by WhatsApp or text. The person sets their name and
  password and joins. Roles: **Owner** (everything, including roles), **Admin** (runs tournaments), **Scorer**
  (scores matches only). Invites expire after 7 days and can be cancelled while pending.
- **Password reset**: the owner (anyone) or an admin (scorers) creates a reset link for a team member; it expires
  after 24 hours. Everyone can change their own password under **Account**.
- **Locked out**: `/forgot` resets any account with the server's `SETUP_KEY`.
- Changing or resetting a password signs that person out on every other device (`User.sessionVersion`).

## Handicaps

Players have a **rank per discipline** (1 = strongest), set on the player's page or for everyone at once under
**Players → Handicap ranks**. A tournament can then use one of three handicap styles:

| Style | Example: Rank 1 v Rank 2, race to 3, start of 1 |
| --- | --- |
| Head start for the weaker player | Rank 2 starts 1–0 up; first to 3 |
| Minus start for the stronger player | Rank 1 starts on −1; first to 3 |
| Longer race for the stronger player | Starts 0–0; Rank 1 races to 4, Rank 2 to 3 |

The start for each rank gap comes from a small table in the tournament settings (gap 1, 2, … 5+). Ranks are copied onto
the entries when the draw is made, so later rank changes don't alter a comp in progress; they can still be corrected on
the entries page. Each match fixes its handicap when it starts, and the scoreboard and tablets show it. Group tables
count only racks actually won, not starts. Rules live in `src/lib/handicap.ts`.

## Pairs comps and frame-list matches

Set **Entries → Pairs** in the tournament settings for comps where two players enter together (e.g. scotch doubles).
Pairs are added on the entries page (from the directory, or new names), with an optional team name and handicap group.

- **Match format**: a plain race (every frame doubles), or a **set list of frames**, each Doubles or a singles frame
  between each pair's Player A and Player B ("A v A", "B v B", "A v B", "B v A"). The default is 10 frames:
  D, A v A, B v B, D, B v B, A v A, D, A v A, B v B, D. Every player gets 3 singles and never plays two in a row.
- **Finish**: first to a majority (6 of 10), or play every frame. In groups a level score is a draw; in knockouts a
  doubles decider is played. Group and knockout matches can use different finishes.
- **Order of play**: Player A and B drawn at random when the match starts, chosen by the pairs before the match, or
  chosen before each singles frame (each player is limited to their share of the singles).
- **Group tables**: the organiser sets points for a win, draw and loss and orders the tiebreakers (frame difference,
  frames won, head-to-head mini-table, shootout). With a shootout, the control room asks for its result before the
  knockout is drawn.
- **Plate**: finishers below the knockout places (e.g. each 3rd) go into a separate plate bracket.
- **A table per group**: each group gets its own table and auto-pilot keeps that group's matches on it, in order.
- **Handicaps**: starts can be set per pairing of groups (1 v 2, 1 v 3, …) instead of per gap.

The tablet shows the match score, a strip of every frame, and big "who won this frame" buttons naming the players.
Each frame records who played it; the public match page lists them. Rules live in `src/lib/match-format.ts` and
`src/lib/standings.ts`.

## Timings and projected finish

Each comp has an **expected frame time** (settings; default 15 minutes) used as its baseline. The admin **Timings**
tab shows how the comp is running against it:

- **Overview**: projected finish, time ahead of or behind the baseline so far, average frame and match, matches left,
  and how long players take to start once a match is sent to their table.
- **Tables**: frames, average frame, frames per hour, time in play and idle time.
- **Players**: average, quickest and longest frame (slowest first). A doubles frame counts for all four players, a
  singles frame for the two who played it.
- **Matches**: start time, time to start, length, frames and average frame.

Frame times come from when each frame is scored (the first from the match start). Frames over 45 minutes are left out
as scoring slips; walkovers and results entered without frames aren't timed. The projection plays out the remaining
matches on the venue's tables in bracket order, at a pace that starts at the baseline and moves to the comp's real
average as frames come in. It includes a not-yet-drawn knockout (estimated from the qualifier numbers) and leaves out a
grand final reset until it's needed. Once matches are on tables it plans on the tables the comp is using; before
that, on all the venue's tables. Logic in `src/lib/timings.ts`.

The same projection gives each upcoming match an **estimated start** on the public order of play ("about 14:40",
"Due now"), rounded to 5 minutes. Organisers can turn this off in the settings ("Show estimated start times").

**End-of-day report** (`/report/[id]`, linked from the Timings tab; organisers only): results, the day against the
plan (the projection at the first break, at baseline pace), highlights (longest and quickest match, longest frame,
break & runs, reverse dishes, quickest players and longest average frames), tables and every result with its length.
It prints, or saves as a PDF, on plain white.

## Entering the draw yourself

When the draw is done in the room (e.g. on a spin-the-wheel), choose **Enter the draw yourself** in the control room
(or set **Draw** in the settings). The control room then shows the draw to fill in: the first-round matches for a
knockout, or each group's places for groups + knockout, with a dropdown for each place. A name picked in one dropdown
drops out of the others. Byes go where the automatic draw puts them (spread through the bracket) and need no pick.
Save, then **Generate this draw**. Knockouts store each entry's line as
its draw number; groups store the group and place, which sets the order of the group's fixtures. Logic in
`src/lib/manual-draw.ts` and `drawToSeedOrder` in `src/lib/bracket.ts`.

## Sharing a venue between comps

Two comps can run at one venue at once, e.g. a main comp and a plate. In the control room's **Tables** card,
**Choose this comp's tables** ticks which of the venue's tables the comp plays on (all of them by default), and can be
changed at any point. To start a plate at the quarter-finals on a 4-table venue, untick Tables 3 and 4 on the main comp
and tick only those on the plate. A match already on a table finishes there; after that the table is the other comp's.
The table dropdowns, auto-pilot, a table per group and the projected finish use only the comp's tables. A table busy
with the other comp shows that comp's name.

## Deploying (Render)

The app runs as **one always-on Node server plus Postgres**. Live updates are passed around inside the server process,
so run a single instance (no autoscaling) until `src/lib/events.ts` moves to a shared pub/sub.

1. In Render: **New → Blueprint**, connect GitHub and pick this repo. `render.yaml` creates the web service and the
   Postgres database (Frankfurt), wires up `DATABASE_URL` and generates `SESSION_PASSWORD`.
2. When asked, enter `SETUP_KEY`: any secret phrase. You need it once, to create the owner account.
3. Wait for the first deploy, then open the `*.onrender.com` address, go to **Get started**, enter the setup key and
   create your organisation.
4. Custom domain: web service → **Settings → Custom Domains → Add**, then add the DNS record Render shows at your
   registrar. HTTPS is automatic (required for `.app` domains).
   Visits to the `*.onrender.com` address are then redirected to the domain in `SITE_HOST` (default `cuecomp.app`,
   see `src/lib/brand.ts`), so shared links and tablet QR codes always use it.

Any host that runs a long-lived Node process works the same way (Railway, Fly.io, a VPS): set `DATABASE_URL`,
`SESSION_PASSWORD` and `SETUP_KEY`, build with `npm run build`, start with `npm start`.

`npm start` applies pending database migrations before starting, so every deploy updates the schema automatically.

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
