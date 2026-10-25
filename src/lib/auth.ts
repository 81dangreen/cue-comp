import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getSession } from "./session";
import type { Role } from "./constants";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: Role;
};

/**
 * The signed-in user and their active organisation, or null.
 * Single-organisation for now: the first membership is the active one.
 * When multi-tenancy arrives, the active org will come from the URL or a switcher.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const { userId } = await getSession();
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { organization: true }, orderBy: { id: "asc" }, take: 1 } },
  });
  const membership = user?.memberships[0];
  if (!user || !membership) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    role: membership.role as Role,
  };
});

const RANK: Record<Role, number> = { SCORER: 1, ADMIN: 2, OWNER: 3 };

/** Redirects to login if signed out; throws if the role is too low. */
export async function requireUser(minRole: Role = "SCORER"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (RANK[user.role] < RANK[minRole]) throw new Error("You don't have permission to do that");
  return user;
}

/** Load a tournament only if it belongs to the user's organisation. */
export async function requireTournament(tournamentId: string, minRole: Role = "ADMIN") {
  const user = await requireUser(minRole);
  const tournament = await db.tournament.findFirst({
    where: { id: tournamentId, organizationId: user.organizationId },
  });
  if (!tournament) throw new Error("Tournament not found");
  return { user, tournament };
}

export async function requireMatch(matchId: string, minRole: Role = "SCORER") {
  const user = await requireUser(minRole);
  const match = await db.match.findFirst({
    where: { id: matchId, tournament: { organizationId: user.organizationId } },
    include: { tournament: true },
  });
  if (!match) throw new Error("Match not found");
  return { user, match };
}
