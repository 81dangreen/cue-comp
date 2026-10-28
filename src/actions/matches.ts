"use server";

import { requireMatch } from "@/lib/auth";
import type { Lineup } from "@/lib/match-format";
import { addFrame, assignTable, setResult, startMatch, undoFrame } from "@/lib/tournament-service";
import type { ActionResult } from "@/components/forms";
import { run } from "./util";

/** Players named for a frame when pairs pick frame by frame. */
export type FramePick = { player1Id?: string; player2Id?: string };

export async function addFrameAction(matchId: string, slot: 1 | 2, breakAndRun = false, picked?: FramePick) {
  return run(async () => {
    await requireMatch(matchId);
    await addFrame(matchId, slot, breakAndRun, picked);
  });
}

export async function undoFrameAction(matchId: string) {
  return run(async () => {
    await requireMatch(matchId);
    await undoFrame(matchId);
  });
}

export async function startMatchAction(matchId: string, breakSlot?: 1 | 2, lineup?: Lineup | null) {
  return run(async () => {
    await requireMatch(matchId);
    await startMatch(matchId, breakSlot, lineup);
  });
}

export async function setResultAction(matchId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    await requireMatch(matchId, "ADMIN");
    const s1 = Number(formData.get("score1"));
    const s2 = Number(formData.get("score2"));
    if (!Number.isInteger(s1) || !Number.isInteger(s2)) throw new Error("Enter both scores");
    await setResult(matchId, s1, s2);
    return "Result saved";
  });
}

export async function assignTableAction(matchId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    await requireMatch(matchId, "ADMIN");
    const tableId = String(formData.get("tableId") ?? "") || null;
    await assignTable(matchId, tableId);
  });
}
