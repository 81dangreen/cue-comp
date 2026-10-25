"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "@/components/forms";
import { newPairingCode, PAIRING_TTL_MS } from "@/lib/device";
import { formObject, run } from "./util";

const venueSchema = z.object({
  name: z.string().min(1, "Venue name is required").max(80),
  address: z.string().max(200).optional(),
  tables: z.coerce.number().int().min(0).max(64).optional(),
});

async function ownVenue(venueId: string) {
  const user = await requireUser("ADMIN");
  const venue = await db.venue.findFirst({ where: { id: venueId, organizationId: user.organizationId } });
  if (!venue) throw new Error("Venue not found");
  return venue;
}

export async function createVenue(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  const parsed = venueSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, address, tables = 0 } = parsed.data;
  const venue = await db.venue.create({
    data: {
      name,
      address,
      organizationId: user.organizationId,
      tables: { create: Array.from({ length: tables }, (_, i) => ({ name: `Table ${i + 1}`, sortOrder: i + 1 })) },
    },
  });
  redirect(`/admin/venues/${venue.id}`);
}

export async function updateVenue(venueId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    await ownVenue(venueId);
    const { name, address } = venueSchema.parse(formObject(formData));
    await db.venue.update({ where: { id: venueId }, data: { name, address: address ?? null } });
    return "Saved";
  });
}

export async function deleteVenue(venueId: string) {
  await ownVenue(venueId);
  await db.venue.delete({ where: { id: venueId } });
  redirect("/admin/venues");
}

export async function addTable(venueId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    await ownVenue(venueId);
    const count = await db.table.count({ where: { venueId } });
    const name = String(formData.get("name") ?? "").trim() || `Table ${count + 1}`;
    const streamUrl = String(formData.get("streamUrl") ?? "").trim() || null;
    await db.table.create({ data: { venueId, name, streamUrl, sortOrder: count + 1 } });
  });
}

export async function updateTable(tableId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    const table = await db.table.findUniqueOrThrow({ where: { id: tableId } });
    await ownVenue(table.venueId);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) throw new Error("Table name is required");
    const streamUrl = String(formData.get("streamUrl") ?? "").trim() || null;
    await db.table.update({ where: { id: tableId }, data: { name, streamUrl } });
    return "Saved";
  });
}

export async function deleteTable(tableId: string) {
  return run(async () => {
    const table = await db.table.findUniqueOrThrow({ where: { id: tableId } });
    await ownVenue(table.venueId);
    await db.table.delete({ where: { id: tableId } });
  });
}

async function ownTable(tableId: string) {
  const user = await requireUser("ADMIN");
  const table = await db.table.findFirst({ where: { id: tableId, venue: { organizationId: user.organizationId } } });
  if (!table) throw new Error("Table not found");
  return table;
}

/** Start pairing a tablet: issue a short-lived one-time code for this table. */
export async function createPairingCode(tableId: string) {
  return run(async () => {
    await ownTable(tableId);
    // Retry on the (unlikely) clash with another table's live code.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await db.table.update({
          where: { id: tableId },
          data: { pairingCode: newPairingCode(), pairingExpiresAt: new Date(Date.now() + PAIRING_TTL_MS) },
        });
        return;
      } catch (e) {
        if (attempt === 4) throw e;
      }
    }
  });
}

export async function cancelPairing(tableId: string) {
  return run(async () => {
    await ownTable(tableId);
    await db.table.update({ where: { id: tableId }, data: { pairingCode: null, pairingExpiresAt: null } });
  });
}

export async function unpairDevice(deviceId: string) {
  return run(async () => {
    const user = await requireUser("ADMIN");
    const { count } = await db.device.deleteMany({ where: { id: deviceId, organizationId: user.organizationId } });
    if (!count) throw new Error("Tablet not found");
    return "Tablet unpaired";
  });
}
