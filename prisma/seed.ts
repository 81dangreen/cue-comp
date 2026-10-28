// Demo data: an organisation, owner login, a venue with tables, players, and
// three tournaments in different states. Run with `npm run db:seed`.
// Uses the real tournament service so brackets are built exactly as in the app.
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { addFrame, generateDraw, generateKnockout } from "../src/lib/tournament-service";

const db = new PrismaClient();

const NAMES = [
  "Alex Pagulayan", "Karen Corr", "Darren Appleton", "Allison Fisher", "Jayson Shaw", "Kelly Fisher",
  "Ralf Souquet", "Jasmin Ouschan", "Joshua Filler", "Chezka Centeno", "Shane Van Boening", "Ga-Young Kim",
  "Albin Ouschan", "Siming Chen", "Fedor Gorst", "Han Yu", "Eklent Kaci", "Pia Filler",
  "Ko Pin-yi", "Rubilen Amit", "Mika Immonen", "Jeanette Lee", "Niels Feijen", "Monica Webb",
];

async function playMatch(matchId: string, raceTo: number) {
  // Random but plausible scoreline.
  const winner = Math.random() < 0.5 ? 1 : 2;
  const loserScore = Math.floor(Math.random() * raceTo);
  const racks: (1 | 2)[] = [
    ...Array<1 | 2>(raceTo - 1).fill(winner),
    ...Array<1 | 2>(loserScore).fill(winner === 1 ? 2 : 1),
  ].sort(() => Math.random() - 0.5);
  racks.push(winner);
  for (const slot of racks) await addFrame(matchId, slot, Math.random() < 0.08 ? "BREAK" : null);
}

async function playReady(tournamentId: string, limit = Infinity) {
  let played = 0;
  while (played < limit) {
    const next = await db.match.findFirst({
      where: { tournamentId, status: "READY" },
      orderBy: [{ round: "asc" }, { position: "asc" }],
    });
    if (!next) break;
    await playMatch(next.id, next.raceTo);
    played++;
  }
}

/** Northside Pool League: an organiser who uses the shared player directory but can't edit it. */
export async function seedSecondOrganiser() {
  if (await db.user.findUnique({ where: { email: "organiser@example.com" } })) return;
  const org = await db.organization.create({ data: { name: "Northside Pool League", slug: "northside" } });
  await db.user.create({
    data: {
      name: "League Organiser",
      email: "organiser@example.com",
      passwordHash: await bcrypt.hash("password123", 12),
      memberships: { create: { organizationId: org.id, role: "OWNER" } },
    },
  });
  await db.venue.create({
    data: {
      organizationId: org.id,
      name: "Northside Social Club",
      tables: { create: Array.from({ length: 4 }, (_, i) => ({ name: `Table ${i + 1}`, sortOrder: i + 1 })) },
    },
  });
}

async function main() {
  if ((await db.user.count()) > 0) {
    console.log("Database already has users — skipping seed. Run `npm run db:reset` to start fresh.");
    return;
  }

  const org = await db.organization.create({ data: { name: "Riverside Pool Club", slug: "riverside" } });
  await db.user.create({
    data: {
      name: "Club Organiser",
      email: "admin@example.com",
      passwordHash: await bcrypt.hash("password123", 12),
      directoryAdmin: true,
      memberships: { create: { organizationId: org.id, role: "OWNER" } },
    },
  });
  const venue = await db.venue.create({
    data: {
      organizationId: org.id,
      name: "Riverside Snooker & Pool",
      address: "1 Quay Street",
      tables: { create: Array.from({ length: 8 }, (_, i) => ({ name: `Table ${i + 1}`, sortOrder: i + 1 })) },
    },
    include: { tables: true },
  });
  const players = [];
  for (const full of NAMES) {
    const [firstName, ...rest] = full.split(" ");
    players.push(await db.player.create({ data: { organizationId: org.id, firstName, lastName: rest.join(" ") } }));
  }

  const day = 24 * 60 * 60 * 1000;

  // 1. Finished single-elimination event.
  const finished = await db.tournament.create({
    data: {
      organizationId: org.id, venueId: venue.id, name: "Autumn 9-Ball Open", slug: "autumn-9-ball-open",
      discipline: "NINE_BALL", format: "SINGLE_ELIM", raceTo: 5, raceToFinal: 7,
      startsAt: new Date(Date.now() - 14 * day), entryFee: "£15",
      entries: { create: players.slice(0, 16).map((p) => ({ playerId: p.id })) },
    },
  });
  await generateDraw(finished.id);
  await playReady(finished.id);

  // 2. Double elimination in progress, with matches live on tables.
  const live = await db.tournament.create({
    data: {
      organizationId: org.id, venueId: venue.id, name: "Friday Night 8-Ball", slug: "friday-night-8-ball",
      discipline: "EIGHT_BALL", format: "DOUBLE_ELIM", raceTo: 4, raceToFinal: 6, startsAt: new Date(),
      description: "Weekly double-elimination 8-ball. Winner breaks. Call pocket.",
      entries: { create: players.slice(0, 20).map((p) => ({ playerId: p.id })) },
    },
  });
  await generateDraw(live.id);
  await playReady(live.id, 14);
  const ready = await db.match.findMany({ where: { tournamentId: live.id, status: "READY" }, take: 3 });
  for (let i = 0; i < ready.length; i++) {
    await db.match.update({ where: { id: ready[i].id }, data: { tableId: venue.tables[i].id } });
    await addFrame(ready[i].id, 1);
    if (i !== 1) await addFrame(ready[i].id, 2);
  }

  // 3. Groups → knockout, group stage done and knockout generated.
  const groups = await db.tournament.create({
    data: {
      organizationId: org.id, venueId: venue.id, name: "Club 10-Ball Championship", slug: "club-10-ball-championship",
      discipline: "TEN_BALL", format: "GROUPS_KO", raceTo: 3, raceToFinal: 5, groupCount: 4, qualifiersPerGroup: 2,
      startsAt: new Date(Date.now() - 2 * day),
      entries: { create: players.slice(4, 20).map((p) => ({ playerId: p.id })) },
    },
  });
  await generateDraw(groups.id);
  await playReady(groups.id);
  await generateKnockout(groups.id);
  await playReady(groups.id, 4);

  // 4. Upcoming event with registration open.
  await db.tournament.create({
    data: {
      organizationId: org.id, venueId: venue.id, name: "Winter Snooker Classic", slug: "winter-snooker-classic",
      discipline: "SNOOKER", format: "DOUBLE_ELIM", raceTo: 3, startsAt: new Date(Date.now() + 21 * day),
      status: "REGISTRATION", registrationOpen: true, maxEntries: 32, entryFee: "£20",
      entries: { create: players.slice(10, 16).map((p) => ({ playerId: p.id })) },
    },
  });

  // 5. A second organiser sharing the same player directory, without directory-admin rights.
  await seedSecondOrganiser();

  console.log("Seeded demo data. Log in as admin@example.com / password123 (directory admin)");
  console.log("Second organiser: organiser@example.com / password123 (Northside Pool League)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
