import { setWalkoverAction } from "@/actions/matches";
import { WALKOVER_SCORING } from "@/lib/tournament-service";
import { ActionForm, SubmitButton } from "../forms";
import { cx, Select } from "../ui";

/**
 * Organiser-only "Walkover" button that opens a small form: who gets the match, and whether
 * it counts as a win with no frames or a win by the full score (e.g. 6–0).
 */
export function WalkoverControl({
  matchId,
  side1,
  side2,
  fullScore,
  dark,
}: {
  matchId: string;
  side1: string;
  side2: string;
  /** What "the full score" means for this match, e.g. "6–0". */
  fullScore: string;
  /** For the dark scoring page. */
  dark?: boolean;
}) {
  return (
    <details className="group relative">
      <summary
        className={cx(
          "cursor-pointer list-none rounded-md border px-2.5 py-1 text-xs font-semibold select-none [&::-webkit-details-marker]:hidden",
          dark ? "border-white/20 text-white/80 hover:bg-white/10" : "border-border text-muted hover:bg-surface-2",
        )}
      >
        Walkover…
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-border bg-surface p-4 text-left text-foreground shadow-xl">
        <ActionForm action={setWalkoverAction.bind(null, matchId)} className="space-y-3">
          <p className="text-sm font-semibold">Give the match to</p>
          <div className="space-y-1.5 text-sm">
            {[side1, side2].map((name, i) => (
              <label key={i} className="flex items-start gap-2">
                <input type="radio" name="winner" value={i + 1} required className="mt-1" />
                <span>{name}</span>
              </label>
            ))}
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Count it as</span>
            <Select name="scoring" defaultValue="NO_FRAMES" className="py-1.5 text-sm">
              <option value="NO_FRAMES">{WALKOVER_SCORING.NO_FRAMES} (points only)</option>
              <option value="FULL">
                {WALKOVER_SCORING.FULL} ({fullScore})
              </option>
            </Select>
          </label>
          <SubmitButton className="w-full" pendingText="Recording…">
            Record walkover
          </SubmitButton>
        </ActionForm>
      </div>
    </details>
  );
}
