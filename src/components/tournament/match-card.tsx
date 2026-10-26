import Link from "next/link";
import type { MatchWithTable } from "@/lib/queries";
import { cx } from "../ui";

/** Height of a card, so void placeholders keep the bracket grid aligned. */
const CARD_HEIGHT = "h-[95px]";

function Side({
  name,
  score,
  isWinner,
  decided,
  showScore,
  bye,
}: {
  name?: string;
  score: number;
  isWinner: boolean;
  decided: boolean;
  showScore: boolean;
  bye: boolean;
}) {
  return (
    <div className={cx("flex h-[34px] items-center justify-between gap-2 pl-3", isWinner && "bg-accent-soft")}>
      <span
        className={cx(
          "truncate text-[15px]",
          isWinner && "font-semibold",
          decided && !isWinner && "text-muted",
          !name && "italic text-muted",
        )}
      >
        {name ?? (bye ? "Bye" : "TBD")}
      </span>
      {showScore && (
        <span
          className={cx(
            "grid h-full w-9 shrink-0 place-items-center text-[15px] font-bold tabular-nums",
            isWinner ? "bg-accent text-accent-fg" : "bg-surface-2",
            decided && !isWinner && "text-muted",
          )}
        >
          {score}
        </span>
      )}
    </div>
  );
}

export function MatchCard({
  match,
  names,
  label,
  fluid,
  href,
  className,
}: {
  match: MatchWithTable;
  names: Map<string, string>;
  /** Round name shown in the card header; the bracket view shows it above the column instead. */
  label?: string;
  /** Fill the container width instead of the fixed bracket width. */
  fluid?: boolean;
  href?: string;
  className?: string;
}) {
  // A bye "completes" automatically; don't present it as a won match.
  const decided = match.status === "COMPLETED" && !match.isBye;
  const live = match.status === "LIVE";
  const showScore = !match.isBye && (live || decided || match.score1 + match.score2 > 0);
  const n1 = match.entry1Id ? names.get(match.entry1Id) : undefined;
  const n2 = match.entry2Id ? names.get(match.entry2Id) : undefined;

  if (match.status === "VOID") {
    return <div className={cx(CARD_HEIGHT, fluid ? "w-full" : "w-60", "rounded-lg border-2 border-dashed border-border", className)} />;
  }

  const body = (
    <div
      className={cx(
        CARD_HEIGHT,
        fluid ? "w-full" : "w-60",
        "overflow-hidden rounded-lg border bg-surface text-left shadow-sm transition",
        live ? "border-live ring-1 ring-live" : "border-border",
        match.isBye && "opacity-60 shadow-none",
        href && "hover:border-accent hover:ring-1 hover:ring-accent",
        className,
      )}
    >
      <div
        className={cx(
          "flex h-6 items-center justify-between gap-2 px-3 text-xs",
          live ? "bg-live font-semibold text-live-fg" : "border-b border-border bg-surface-2 text-muted",
        )}
      >
        <span className="truncate">
          {live && <span className="live-dot mr-1">●</span>}
          {live ? `LIVE${label ? ` · ${label}` : ""}` : label}
        </span>
        <span className="shrink-0">
          {match.table ? match.table.name : !match.isBye && !decided ? `Race to ${match.raceTo}` : ""}
        </span>
      </div>
      <Side
        name={n1}
        score={match.score1}
        isWinner={decided && match.winnerId === match.entry1Id && !!match.entry1Id}
        decided={decided}
        showScore={showScore}
        bye={match.isBye && !match.entry1Id}
      />
      <div className="border-t border-border" />
      <Side
        name={n2}
        score={match.score2}
        isWinner={decided && match.winnerId === match.entry2Id && !!match.entry2Id}
        decided={decided}
        showScore={showScore}
        bye={match.isBye && !match.entry2Id}
      />
    </div>
  );
  return href ? <Link href={href} className={fluid ? "block" : undefined}>{body}</Link> : body;
}
