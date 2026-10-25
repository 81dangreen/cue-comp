"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, limitAttempts } from "@/lib/rate-limit";
import { checkSetupKey } from "@/lib/setup";
import { clearSession, setSession } from "@/lib/session";
import type { ActionResult } from "@/components/forms";
import { formObject, slugify } from "./util";

const setupSchema = z.object({
  organizationName: z.string().min(2, "Organisation name is required"),
  name: z.string().min(2, "Your name is required"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/** First-run setup: creates the organisation and its owner. Only works while there are no users. */
export async function setupAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    limitAttempts(`setup:${await clientIp()}`, 5, 15 * 60_000);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const keyError = checkSetupKey(String(formData.get("setupKey") ?? ""));
  if (keyError) return { error: keyError };
  const parsed = setupSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if ((await db.user.count()) > 0) return { error: "Setup has already been completed — please log in" };

  const { organizationName, name, email, password } = parsed.data;
  const user = await db.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
      // The first account on a new install runs the shared player directory.
      directoryAdmin: true,
      memberships: {
        create: {
          role: "OWNER",
          organization: { create: { name: organizationName, slug: slugify(organizationName) || "org" } },
        },
      },
    },
  });
  await setSession({ userId: user.id });
  redirect("/admin");
}

const loginSchema = z.object({ email: z.string().min(1), password: z.string().min(1) });
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

export async function loginAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: "Enter your email and password" };
  try {
    limitAttempts(`login-ip:${await clientIp()}`, 30, 15 * 60_000);
    limitAttempts(`login-email:${parsed.data.email.toLowerCase()}`, 10, 15 * 60_000);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  // Compare against a dummy hash when the user doesn't exist to keep timing similar.
  const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return { error: "Incorrect email or password" };
  await setSession({ userId: user.id });
  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/admin");
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}
