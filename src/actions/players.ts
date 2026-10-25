"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "@/components/forms";
import { formObject, run } from "./util";

const playerSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(60),
  lastName: z.string().min(1, "Last name is required").max(60),
  nickname: z.string().max(40).optional(),
  email: z.email("Enter a valid email").optional(),
  phone: z.string().max(30).optional(),
  country: z.string().max(60).optional(),
});

export async function createPlayer(_prev: ActionResult, formData: FormData) {
  return run(async () => {
    const user = await requireUser("ADMIN");
    const data = playerSchema.parse(formObject(formData));
    await db.player.create({ data: { ...data, organizationId: user.organizationId } });
    return `Added ${data.firstName} ${data.lastName}`;
  });
}

export async function updatePlayer(playerId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    const user = await requireUser("ADMIN");
    const data = playerSchema.parse(formObject(formData));
    const { count } = await db.player.updateMany({
      where: { id: playerId, organizationId: user.organizationId },
      data: { nickname: null, email: null, phone: null, country: null, ...data },
    });
    if (!count) throw new Error("Player not found");
    return "Saved";
  });
}

export async function deletePlayer(playerId: string) {
  const user = await requireUser("ADMIN");
  const entries = await db.entry.count({ where: { playerId } });
  if (entries > 0) throw new Error("This player has tournament history and can't be deleted");
  await db.player.deleteMany({ where: { id: playerId, organizationId: user.organizationId } });
  redirect("/admin/players");
}

/** Paste a list of names, one per line: "First Last" or "Last, First". */
export async function importPlayers(_prev: ActionResult, formData: FormData) {
  return run(async () => {
    const user = await requireUser("ADMIN");
    const lines = String(formData.get("names") ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) throw new Error("Paste at least one name");
    const players = lines.map((line) => {
      if (line.includes(",")) {
        const [last, first] = line.split(",").map((s) => s.trim());
        return { firstName: first || last, lastName: first ? last : "" };
      }
      const parts = line.split(/\s+/);
      return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
    });
    await db.player.createMany({
      data: players.map((p) => ({ ...p, organizationId: user.organizationId })),
    });
    return `Imported ${players.length} players`;
  });
}
