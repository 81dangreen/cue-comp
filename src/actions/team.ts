"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientIp, limitAttempts } from "@/lib/rate-limit";
import { setSession } from "@/lib/session";
import { checkSetupKey } from "@/lib/setup";
import {
  acceptInvite,
  changeOwnPassword,
  changeRole,
  createInvite,
  createReset,
  recoverWithSetupKey,
  removeMember,
  revokeInvite,
  TeamError,
  redeemReset,
} from "@/lib/team";
import { siteOrigin } from "@/lib/tokens";
import type { ActionResult } from "@/components/forms";
import { run } from "./util";

/** Result of creating a link: shown once, since only its hash is stored. */
export type LinkResult = { error?: string; message?: string; link?: string } | undefined;

const field = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export async function createInviteAction(_prev: LinkResult, formData: FormData): Promise<LinkResult> {
  try {
    const user = await requireUser("ADMIN");
    const token = await createInvite(user, field(formData, "role"), field(formData, "label") || null);
    return { message: "Invite link ready", link: `${await siteOrigin()}/invite/${token}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function createResetAction(userId: string): Promise<LinkResult> {
  try {
    const user = await requireUser("ADMIN");
    const { token, name } = await createReset(user, userId);
    return { message: `Reset link for ${name}`, link: `${await siteOrigin()}/reset/${token}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function revokeInviteAction(inviteId: string) {
  return run(async () => {
    const user = await requireUser("ADMIN");
    await revokeInvite(user.organizationId, inviteId);
    return "Invite cancelled";
  });
}

export async function changeRoleAction(userId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    const user = await requireUser("OWNER");
    await changeRole(user, userId, field(formData, "role"));
    return "Role updated";
  });
}

export async function removeMemberAction(userId: string) {
  return run(async () => {
    const user = await requireUser("ADMIN");
    await removeMember(user, userId);
    return "Removed from the team";
  });
}

/** Someone opening an invite link creates their account and is signed in. */
export async function acceptInviteAction(token: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let user;
  try {
    limitAttempts(`invite:${await clientIp()}`, 20, 15 * 60_000);
    user = await acceptInvite(token, {
      name: field(formData, "name"),
      email: field(formData, "email"),
      password: String(formData.get("password") ?? ""),
      confirm: String(formData.get("confirm") ?? ""),
    });
  } catch (e) {
    return { error: e instanceof TeamError || e instanceof Error ? e.message : "Something went wrong" };
  }
  await setSession({ userId: user.id, v: user.sessionVersion });
  redirect("/admin");
}

export async function resetPasswordAction(token: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let user;
  try {
    limitAttempts(`reset:${await clientIp()}`, 20, 15 * 60_000);
    user = await redeemReset(token, String(formData.get("password") ?? ""), String(formData.get("confirm") ?? ""));
  } catch (e) {
    return { error: (e as Error).message };
  }
  await setSession({ userId: user.id, v: user.sessionVersion });
  redirect("/admin");
}

/** Owner recovery with the server's SETUP_KEY, for when nobody else can create a reset link. */
export async function recoverAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    limitAttempts(`recover:${await clientIp()}`, 5, 15 * 60_000);
    if (!process.env.SETUP_KEY) return { error: "Recovery isn't switched on: set SETUP_KEY in the server settings first" };
    const keyError = checkSetupKey(field(formData, "setupKey"));
    if (keyError) return { error: "Incorrect setup key" };
    await recoverWithSetupKey(field(formData, "email"), String(formData.get("password") ?? ""), String(formData.get("confirm") ?? ""));
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect("/login?reset=1");
}

export async function updateAccountAction(_prev: ActionResult, formData: FormData) {
  return run(async () => {
    const user = await requireUser();
    const name = field(formData, "name");
    if (name.length < 2) throw new Error("Enter your name");
    await db.user.update({ where: { id: user.id }, data: { name } });
    return "Saved";
  });
}

export async function changePasswordAction(_prev: ActionResult, formData: FormData) {
  return run(async () => {
    const user = await requireUser();
    limitAttempts(`password:${user.id}`, 10, 15 * 60_000);
    const updated = await changeOwnPassword(
      user.id,
      String(formData.get("current") ?? ""),
      String(formData.get("password") ?? ""),
      String(formData.get("confirm") ?? ""),
    );
    // Other devices are signed out; this one stays signed in.
    await setSession({ userId: user.id, v: updated.sessionVersion });
    return "Password changed. Any other devices have been signed out.";
  });
}
