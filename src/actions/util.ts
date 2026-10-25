import "server-only";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/forms";

/**
 * Run a mutation, refresh the current route, and turn thrown errors into a
 * message for the form. Next.js control-flow errors (redirect etc.) pass through.
 */
export async function run(fn: () => Promise<string | void>): Promise<ActionResult> {
  try {
    const message = await fn();
    refresh();
    return { message: message || undefined };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid input" };
    if (e instanceof Error) return { error: e.message };
    return { error: "Something went wrong" };
  }
}

/** FormData → plain object, with empty strings dropped so optional fields stay undefined. */
export function formObject(formData: FormData) {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && value.trim() !== "" && !key.startsWith("$")) out[key] = value.trim();
  }
  return out;
}

export const optionalInt = z.coerce.number().int().positive().optional();

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 60);
}
