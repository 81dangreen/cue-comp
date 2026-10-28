"use server";

import { redirect } from "next/navigation";
import { forgetDevice, pairDevice, requireDeviceMatch } from "@/lib/device";
import { isDish, type Dish } from "@/lib/constants";
import type { Lineup } from "@/lib/match-format";
import { clientIp, limitAttempts } from "@/lib/rate-limit";
import { addFrame, startMatch, undoFrame } from "@/lib/tournament-service";
import type { ActionResult } from "@/components/forms";
import type { FramePick } from "./matches";
import { run } from "./util";

// Actions used by a paired table tablet. Each one re-checks that the match is
// still assigned to this tablet's table.

export async function pairTabletAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    limitAttempts(`pair:${await clientIp()}`, 10, 10 * 60_000);
    await pairDevice(String(formData.get("code") ?? ""), String(formData.get("name") ?? ""));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Pairing failed" };
  }
  redirect("/table");
}

export async function unpairTabletAction() {
  await forgetDevice();
  redirect("/table");
}

export async function tableStartMatchAction(matchId: string, breakSlot: 1 | 2, lineup?: Lineup | null) {
  return run(async () => {
    await requireDeviceMatch(matchId);
    await startMatch(matchId, breakSlot, lineup);
  });
}

export async function tableAddFrameAction(matchId: string, slot: 1 | 2, dish: Dish | null = null, picked?: FramePick) {
  return run(async () => {
    const { match } = await requireDeviceMatch(matchId);
    if (match.status !== "LIVE") throw new Error("Start the match first");
    await addFrame(matchId, slot, isDish(dish) ? dish : null, picked);
  });
}

export async function tableUndoFrameAction(matchId: string) {
  return run(async () => {
    const { match } = await requireDeviceMatch(matchId);
    // Finished results are corrected by the organiser, not at the table.
    if (match.status !== "LIVE") throw new Error("Ask the organiser to correct a finished match");
    await undoFrame(matchId);
  });
}
