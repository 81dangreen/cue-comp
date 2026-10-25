import { roundLabel } from "@/lib/bracket";
import type { MatchWithTable } from "@/lib/queries";
import { cx } from "../ui";
import { MatchCard } from "./match-card";

/** Half the gap between round columns (gap-12); each connector arm is this long. */
const ARM = "w-6";
const LINE = "border-muted/45";

function Section({
  title,
  matches,
  names,
  linkFor,
  doubleElim,
}: {
  title?: string;
  matches: MatchWithTable[];
  names: Map<string, string>;
  linkFor?: (m: MatchWithTable) => string | undefined;
  doubleElim: boolean;
}) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const total = rounds.length ? Math.max(...rounds) : 0;
  const byRound = rounds.map((round) => matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position));

  return (
    <section className="mb-10">
      {title && <h2 className="mb-4 text-xl font-semibold">{title}</h2>}
      <div className="overflow-x-auto pb-3">
        <div className="flex min-w-max gap-12">
          {byRound.map((inRound, ri) => {
            const count = inRound.length;
            const next = byRound[ri + 1]?.length;
            const prev = byRound[ri - 1]?.length;
            // Winners of a pair meet in the next round (halving), or each winner moves straight across.
            const out = next === undefined ? null : next * 2 === count ? "merge" : next === count ? "straight" : null;
            const incoming = prev !== undefined && (prev === count * 2 || prev === count);
            return (
              <div key={rounds[ri]} className="flex w-60 flex-col">
                <div className="mb-3 rounded-lg bg-header px-3 py-2 text-header-fg">
                  <div className="text-sm font-semibold">{roundLabel(inRound[0].bracket, rounds[ri], total, { doubleElim })}</div>
                  <div className="text-xs text-header-fg/75">Race to {inRound[0].raceTo}</div>
                </div>
                <div className="flex flex-1 flex-col">
                  {inRound.map((m, i) => (
                    <div key={m.id} className="relative flex flex-1 items-center py-2">
                      {incoming && <span className={cx("absolute right-full top-1/2 border-t-2", ARM, LINE)} />}
                      <MatchCard match={m} names={names} href={linkFor?.(m)} />
                      {out && <span className={cx("absolute left-full top-1/2 border-t-2", ARM, LINE)} />}
                      {out === "merge" && (
                        <span
                          className={cx(
                            "absolute left-[calc(100%+1.5rem)] -ml-0.5 border-l-2",
                            LINE,
                            i % 2 === 0 ? "top-1/2 bottom-0" : "top-0 bottom-1/2",
                          )}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function BracketView({
  matches,
  names,
  linkFor,
}: {
  matches: MatchWithTable[];
  names: Map<string, string>;
  linkFor?: (m: MatchWithTable) => string | undefined;
}) {
  const winners = matches.filter((m) => m.bracket === "WINNERS");
  const losers = matches.filter((m) => m.bracket === "LOSERS");
  const finals = matches.filter((m) => m.bracket === "FINAL");
  const isDouble = losers.length > 0 || finals.length > 0;

  if (!winners.length) return null;
  if (!isDouble) return <Section matches={winners} names={names} linkFor={linkFor} doubleElim={false} />;
  return (
    <>
      <Section title="Winners bracket" matches={winners} names={names} linkFor={linkFor} doubleElim />
      {losers.length > 0 && <Section title="Losers bracket" matches={losers} names={names} linkFor={linkFor} doubleElim />}
      <Section
        title="Grand final"
        matches={finals.filter((m) => m.status !== "VOID" || m.round === 1)}
        names={names}
        linkFor={linkFor}
        doubleElim
      />
    </>
  );
}
