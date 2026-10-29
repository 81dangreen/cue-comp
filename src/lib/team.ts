import "server-only";
import bcrypt from "bcryptjs";
import { db } from "./db";
import type { Role } from "./constants";
import { hashToken, newToken } from "./tokens";

// Organisation members: invites, roles, removal and password resets.
// Callers check who is asking (src/actions/team.ts); these enforce the rules about who can be changed.

export class TeamError extends Error {}

export const INVITE_DAYS = 7;
export const RESET_HOURS = 24;
export const MIN_PASSWORD = 8;
/** Roles an invite or a role change can give; there is one owner per organisation. */
export const ASSIGNABLE_ROLES = ["ADMIN", "SCORER"] as const;

export const hashPassword = (password: string) => bcrypt.hash(password, 12);

export function checkPassword(password: string, confirm?: string) {
  if (password.length < MIN_PASSWORD) throw new TeamError(`Passwords need at least ${MIN_PASSWORD} characters`);
  if (confirm !== undefined && password !== confirm) throw new TeamError("The two passwords don't match");
}

const RANK: Record<Role, number> = { SCORER: 1, ADMIN: 2, OWNER: 3 };

/** Owners manage everyone; admins manage scorers only. Nobody manages themselves here. */
function canManage(actor: { id: string; role: Role }, target: { userId: string; role: string }) {
  if (actor.id === target.userId) return false;
  return actor.role === "OWNER" || (actor.role === "ADMIN" && RANK[target.role as Role] < RANK.ADMIN);
}

async function membership(organizationId: string, userId: string) {
  const m = await db.membership.findUnique({ where: { userId_organizationId: { userId, organizationId } }, include: { user: true } });
  if (!m) throw new TeamError("That person isn't on your team");
  return m;
}

export async function createInvite(actor: { id: string; organizationId: string }, role: string, label: string | null) {
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) throw new TeamError("Choose Admin or Scorer");
  const { token, hash } = newToken();
  await db.invite.create({
    data: {
      organizationId: actor.organizationId,
      tokenHash: hash,
      role,
      label,
      createdById: actor.id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    },
  });
  return token;
}

/** A usable invite for this token, or null if it's unknown, used or expired. */
export async function findInvite(token: string) {
  const invite = await db.invite.findUnique({ where: { tokenHash: hashToken(token) }, include: { organization: true } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) return null;
  return invite;
}

/** Accept an invite by creating the person's account; returns the new user. */
export async function acceptInvite(token: string, details: { name: string; email: string; password: string; confirm: string }) {
  const name = details.name.trim();
  const email = details.email.trim().toLowerCase();
  if (name.length < 2) throw new TeamError("Enter your name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TeamError("Enter a valid email");
  checkPassword(details.password, details.confirm);
  const passwordHash = await hashPassword(details.password);
  return db.$transaction(async (tx) => {
    const invite = await tx.invite.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) throw new TeamError("This invite link has expired or already been used");
    if (await tx.user.findUnique({ where: { email } })) {
      throw new TeamError("There's already an account with that email. Ask your organiser for a password reset link instead.");
    }
    // Claim the invite first so two people can't use one link at the same moment.
    const claimed = await tx.invite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new TeamError("This invite link has already been used");
    return tx.user.create({
      data: { name, email, passwordHash, memberships: { create: { organizationId: invite.organizationId, role: invite.role } } },
    });
  });
}

export async function revokeInvite(organizationId: string, inviteId: string) {
  await db.invite.deleteMany({ where: { id: inviteId, organizationId, usedAt: null } });
}

export async function changeRole(actor: { id: string; organizationId: string; role: Role }, userId: string, role: string) {
  if (actor.role !== "OWNER") throw new TeamError("Only the owner can change roles");
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) throw new TeamError("Choose Admin or Scorer");
  const m = await membership(actor.organizationId, userId);
  if (!canManage(actor, m)) throw new TeamError("You can't change that person's role");
  await db.membership.update({ where: { id: m.id }, data: { role } });
}

/** Take someone off the team. Their account goes too if it belongs to no other organisation. */
export async function removeMember(actor: { id: string; organizationId: string; role: Role }, userId: string) {
  const m = await membership(actor.organizationId, userId);
  if (!canManage(actor, m)) throw new TeamError("You can't remove that person");
  await db.$transaction(async (tx) => {
    await tx.membership.delete({ where: { id: m.id } });
    const others = await tx.membership.count({ where: { userId } });
    if (others === 0) await tx.user.delete({ where: { id: userId } });
    else await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  });
}

/** A one-time link for a team member to choose a new password. Replaces any earlier unused link. */
export async function createReset(actor: { id: string; organizationId: string; role: Role }, userId: string) {
  const m = await membership(actor.organizationId, userId);
  if (!canManage(actor, m)) throw new TeamError("You can't reset that person's password");
  const { token, hash } = newToken();
  await db.$transaction([
    db.passwordReset.deleteMany({ where: { userId, usedAt: null } }),
    db.passwordReset.create({
      data: { userId, tokenHash: hash, createdById: actor.id, expiresAt: new Date(Date.now() + RESET_HOURS * 3_600_000) },
    }),
  ]);
  return { token, name: m.user.name };
}

export async function findReset(token: string) {
  const reset = await db.passwordReset.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) return null;
  return reset;
}

/** Set a new password and sign the person out everywhere; returns the user with their new session version. */
async function setPassword(userId: string, password: string) {
  return db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } },
  });
}

export async function redeemReset(token: string, password: string, confirm: string) {
  checkPassword(password, confirm);
  const reset = await findReset(token);
  if (!reset) throw new TeamError("This reset link has expired or already been used");
  const claimed = await db.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw new TeamError("This reset link has already been used");
  return setPassword(reset.userId, password);
}

/** Owner recovery: whoever holds the server's setup key can reset any account's password. */
export async function recoverWithSetupKey(email: string, password: string, confirm: string) {
  checkPassword(password, confirm);
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) throw new TeamError("No account uses that email");
  await db.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });
  return setPassword(user.id, password);
}

/** A signed-in person changing their own password. */
export async function changeOwnPassword(userId: string, current: string, password: string, confirm: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(current, user.passwordHash))) throw new TeamError("Your current password isn't right");
  checkPassword(password, confirm);
  return setPassword(userId, password);
}
