"use client";

import { useState } from "react";
import { DISCIPLINES, FORMATS } from "@/lib/constants";
import {
  computeHandicap,
  describeHandicap,
  fillBlankStarts,
  HANDICAP_GAPS,
  HANDICAP_STYLES,
  matrixKey,
  matrixSize,
  MAX_MATRIX_RANKS,
  startForGap,
  type StartMatrix,
} from "@/lib/handicap";
import {
  DEFAULT_FRAMES,
  describeFormat,
  FINISH_RULES,
  FRAME_KINDS,
  isSingles,
  LINEUP_MODES,
  majority,
  MAX_FRAMES,
} from "@/lib/match-format";
import { BREAK_RULES } from "@/lib/breaks";
import { DEFAULT_TIEBREAKERS, TIEBREAKERS } from "@/lib/standings";
import { ActionForm, SubmitButton, type FormAction } from "../forms";
import { Button, Field, Input, Select, Textarea } from "../ui";

export type TournamentDefaults = {
  name?: string;
  description?: string | null;
  discipline?: string;
  format?: string;
  raceTo?: number;
  raceToFinal?: number | null;
  maxEntries?: number | null;
  entryFee?: string | null;
  startsAt?: string | null; // yyyy-MM-ddTHH:mm
  venueId?: string | null;
  seeding?: string;
  groupCount?: number | null;
  qualifiersPerGroup?: number | null;
  grandFinalReset?: boolean;
  isPublic?: boolean;
  handicapStyle?: string | null;
  handicapStarts?: number[];
  handicapMatrix?: StartMatrix | null;
  entryType?: string;
  matchFrames?: string[];
  groupFinish?: string;
  koFinish?: string;
  lineupMode?: string;
  breakRule?: string;
  pointsWin?: number;
  pointsDraw?: number;
  pointsLoss?: number;
  tiebreakers?: string[];
  plateQualifiers?: number | null;
  tablePerGroup?: boolean;
};

export function TournamentForm({
  action,
  venues,
  defaults = {},
  submitLabel,
  lockStructure = false,
  lockEntryType = false,
}: {
  action: FormAction;
  venues: { id: string; name: string }[];
  defaults?: TournamentDefaults;
  submitLabel: string;
  /** The draw has been made: format, match length and handicap are fixed. */
  lockStructure?: boolean;
  /** Entries exist: singles/pairs is fixed. */
  lockEntryType?: boolean;
}) {
  const [format, setFormat] = useState(defaults.format ?? "DOUBLE_ELIM");
  const [entryType, setEntryType] = useState(defaults.entryType ?? "SINGLES");
  const [matchFormat, setMatchFormat] = useState(defaults.matchFrames?.length ? "FRAMES" : "RACE");
  const [frames, setFrames] = useState<string[]>(defaults.matchFrames?.length ? defaults.matchFrames : DEFAULT_FRAMES);
  const [raceTo, setRaceTo] = useState(String(defaults.raceTo ?? 5));
  const [handicapStyle, setHandicapStyle] = useState(defaults.handicapStyle ?? "");
  const [starts, setStarts] = useState<string[]>(() =>
    Array.from({ length: HANDICAP_GAPS }, (_, i) =>
      defaults.handicapStarts?.length ? String(startForGap(defaults.handicapStarts, i + 1)) : i === 0 ? "1" : "",
    ),
  );
  const pairs = entryType === "PAIRS";
  const usesFrames = pairs && matchFormat === "FRAMES";
  const hasGroups = format === "GROUPS_KO" || format === "ROUND_ROBIN";
  const hasKnockout = format !== "ROUND_ROBIN";
  const word = pairs ? "pairs" : "players";

  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Tournament name">
          <Input name="name" defaultValue={defaults.name} required placeholder="e.g. Friday Night 9-Ball" />
        </Field>
      </div>
      <Field label="Discipline">
        <Select name="discipline" defaultValue={defaults.discipline ?? "NINE_BALL"}>
          {Object.entries(DISCIPLINES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Format" hint={lockStructure ? "Reset the draw to change the format" : undefined}>
        <Select name="format" value={format} onChange={(e) => setFormat(e.target.value)} disabled={lockStructure}>
          {Object.entries(FORMATS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        {/* Disabled selects don't submit, so mirror the value. */}
        {lockStructure && <input type="hidden" name="format" value={format} />}
      </Field>
      <Field label="Entries" hint={lockEntryType ? "Remove the entries to switch between singles and pairs" : "Pairs: two players per entry, e.g. scotch doubles"}>
        <Select name="entryType" value={entryType} onChange={(e) => setEntryType(e.target.value)} disabled={lockEntryType || lockStructure}>
          <option value="SINGLES">Singles (one player per entry)</option>
          <option value="PAIRS">Pairs (two players per entry)</option>
        </Select>
        {(lockEntryType || lockStructure) && <input type="hidden" name="entryType" value={entryType} />}
      </Field>
      {pairs ? (
        <Field label="Match format">
          <Select name="matchFormat" value={matchFormat} onChange={(e) => setMatchFormat(e.target.value)} disabled={lockStructure}>
            <option value="RACE">A race (every frame doubles)</option>
            <option value="FRAMES">A set list of doubles and singles frames</option>
          </Select>
          {lockStructure && <input type="hidden" name="matchFormat" value={matchFormat} />}
        </Field>
      ) : (
        <div className="hidden sm:block" />
      )}

      {usesFrames ? (
        <FrameFormatFields
          frames={frames}
          onFrames={setFrames}
          defaults={defaults}
          hasGroups={hasGroups}
          hasKnockout={hasKnockout}
          locked={lockStructure}
        />
      ) : (
        <>
          <Field label="Race to" hint="Racks/frames needed to win a match">
            <Input
              name="raceTo"
              type="number"
              min={1}
              max={50}
              value={raceTo}
              onChange={(e) => setRaceTo(e.target.value)}
              required
              readOnly={lockStructure}
            />
          </Field>
          <Field label="Final race to (optional)" hint="Longer race for the final">
            <Input name="raceToFinal" type="number" min={1} max={50} defaultValue={defaults.raceToFinal ?? ""} />
          </Field>
        </>
      )}

      {format === "GROUPS_KO" && (
        <>
          <Field label="Number of groups">
            <Input name="groupCount" type="number" min={1} max={32} defaultValue={defaults.groupCount ?? 4} />
          </Field>
          <Field label="Qualifiers per group" hint="Top finishers in each group go into the knockout">
            <Input name="qualifiersPerGroup" type="number" min={1} max={8} defaultValue={defaults.qualifiersPerGroup ?? 2} />
          </Field>
          <Field label="Plate places per group (optional)" hint="e.g. 1: each 3rd-placed finisher goes into a plate bracket">
            <Input name="plateQualifiers" type="number" min={0} max={8} defaultValue={defaults.plateQualifiers ?? ""} placeholder="None" />
          </Field>
          <div className="hidden sm:block" />
        </>
      )}

      {hasGroups && <GroupRulesFields defaults={defaults} />}

      <Field label="Start date & time">
        <Input name="startsAt" type="datetime-local" defaultValue={defaults.startsAt ?? ""} />
      </Field>
      <Field label="Venue">
        <Select name="venueId" defaultValue={defaults.venueId ?? ""}>
          <option value="">— None —</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={`Max ${word} (optional)`}>
        <Input name="maxEntries" type="number" min={2} defaultValue={defaults.maxEntries ?? ""} />
      </Field>
      <Field label="Entry fee (optional)">
        <Input name="entryFee" defaultValue={defaults.entryFee ?? ""} placeholder="e.g. £10" />
      </Field>
      <Field label="Breaks" hint="Who breaks is chosen at the start of each match; after that this decides, and the tablets show it">
        <Select name="breakRule" defaultValue={defaults.breakRule ?? "ALTERNATE"}>
          {Object.entries(BREAK_RULES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="hidden sm:block" />
      <Field label="Seeding" hint={`Manual: set seeds on the entries page; unseeded ${word} are drawn randomly`}>
        <Select name="seeding" defaultValue={defaults.seeding ?? "RANDOM"}>
          <option value="RANDOM">Random draw</option>
          <option value="MANUAL">Manual seeds</option>
        </Select>
      </Field>
      <div className="flex flex-col justify-center gap-2 pt-5">
        {format === "DOUBLE_ELIM" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="grandFinalReset" defaultChecked={defaults.grandFinalReset ?? true} />
            True double elimination (grand final reset)
          </label>
        )}
        {hasGroups && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="tablePerGroup" defaultChecked={defaults.tablePerGroup ?? false} />
            Give each group its own table
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublic" defaultChecked={defaults.isPublic ?? true} />
          Show on the public site
        </label>
      </div>
      <HandicapFields
        key={pairs ? "pairs" : "singles"}
        style={handicapStyle}
        onStyle={setHandicapStyle}
        starts={starts}
        onStarts={setStarts}
        defaultMatrix={defaults.handicapMatrix ?? null}
        raceTo={usesFrames ? majority(frames.length || 1) : Number(raceTo) || 1}
        unit={usesFrames ? "frames" : "racks"}
        pairs={pairs}
        locked={lockStructure}
      />
      <div className="sm:col-span-2">
        <Field label="Description (optional)">
          <Textarea name="description" defaultValue={defaults.description ?? ""} placeholder="Rules, prizes, schedule…" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** The frame list (doubles / singles A v A …) plus how matches finish and how the order of play is set. */
function FrameFormatFields({
  frames,
  onFrames,
  defaults,
  hasGroups,
  hasKnockout,
  locked,
}: {
  frames: string[];
  onFrames: (f: string[]) => void;
  defaults: TournamentDefaults;
  hasGroups: boolean;
  hasKnockout: boolean;
  locked: boolean;
}) {
  const singlesFor = (letter: "A" | "B", side: 0 | 1) => frames.filter((f) => isSingles(f) && f[side] === letter).length;
  const uneven = singlesFor("A", 0) !== singlesFor("B", 0) || singlesFor("A", 1) !== singlesFor("B", 1);

  return (
    <fieldset className="rounded-xl border border-border p-4 sm:col-span-2" disabled={locked}>
      <legend className="px-1 text-sm font-semibold">Frames in each match</legend>
      {locked && <p className="mb-3 text-sm text-muted">Reset the draw to change the match format.</p>}
      <input type="hidden" name="matchFrames" value={frames.join(",")} />
      <p className="mb-3 text-sm text-muted">
        Each pair has a Player A and a Player B for every match. Singles frames say who plays: “A v B” is the first pair&apos;s A
        against the second pair&apos;s B.
      </p>
      <ol className="grid gap-2 sm:grid-cols-2">
        {frames.map((kind, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-sm text-muted">Frame {i + 1}</span>
            <Select
              aria-label={`Frame ${i + 1}`}
              value={kind}
              onChange={(e) => onFrames(frames.map((f, j) => (j === i ? e.target.value : f)))}
              className="flex-1 py-1.5"
            >
              {Object.entries(FRAME_KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="ghost"
              className="px-2 py-1 text-muted"
              aria-label={`Remove frame ${i + 1}`}
              disabled={frames.length <= 1}
              onClick={() => onFrames(frames.filter((_, j) => j !== i))}
            >
              ✕
            </Button>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" className="py-1.5" disabled={frames.length >= MAX_FRAMES} onClick={() => onFrames([...frames, "D"])}>
          + Add frame
        </Button>
        <Button type="button" variant="ghost" className="py-1.5" onClick={() => onFrames(DEFAULT_FRAMES)}>
          Reset to 10 frames (4 doubles, 6 singles)
        </Button>
      </div>
      <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
        <span className="font-medium">{describeFormat(frames, "FIRST_TO").split(",")[0]}.</span> Singles each: Player A{" "}
        {singlesFor("A", 0)}, Player B {singlesFor("B", 0)}.
        {uneven && <span className="ml-1 font-medium text-warn">The two players in a pair don&apos;t get the same number of singles.</span>}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {hasGroups && (
          <Field label="Group matches" hint={`A level score (e.g. ${Math.floor(frames.length / 2)}–${Math.floor(frames.length / 2)}) is a draw`}>
            <Select name="groupFinish" defaultValue={defaults.groupFinish ?? "FIRST_TO"}>
              <option value="FIRST_TO">First to {majority(frames.length)} (stop once it&apos;s won)</option>
              <option value="ALL">Play all {frames.length} frames (frame difference counts)</option>
            </Select>
          </Field>
        )}
        {hasKnockout && (
          <Field label="Knockout matches" hint="Level after every frame: a doubles decider is played">
            <Select name="koFinish" defaultValue={defaults.koFinish ?? "FIRST_TO"}>
              {Object.keys(FINISH_RULES).map((value) => (
                <option key={value} value={value}>
                  {value === "ALL" ? `Play all ${frames.length} frames` : `First to ${majority(frames.length)}`}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Order of play">
          <Select name="lineupMode" defaultValue={defaults.lineupMode ?? "RANDOM"}>
            {Object.entries(LINEUP_MODES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {/* A disabled fieldset doesn't submit, so carry the saved values through. */}
      {locked && (
        <>
          <input type="hidden" name="groupFinish" value={defaults.groupFinish ?? "FIRST_TO"} />
          <input type="hidden" name="koFinish" value={defaults.koFinish ?? "FIRST_TO"} />
          <input type="hidden" name="lineupMode" value={defaults.lineupMode ?? "RANDOM"} />
        </>
      )}
    </fieldset>
  );
}

/** Points per result and the order of tiebreakers for group tables. */
function GroupRulesFields({ defaults }: { defaults: TournamentDefaults }) {
  const chosen = defaults.tiebreakers ?? DEFAULT_TIEBREAKERS;
  return (
    <fieldset className="rounded-xl border border-border p-4 sm:col-span-2">
      <legend className="px-1 text-sm font-semibold">Group tables</legend>
      <input type="hidden" name="groupRules" value="1" />
      <div className="grid grid-cols-3 gap-3 sm:max-w-sm">
        <Field label="Win">
          <Input name="pointsWin" type="number" min={-10} max={10} defaultValue={defaults.pointsWin ?? 2} />
        </Field>
        <Field label="Draw">
          <Input name="pointsDraw" type="number" min={-10} max={10} defaultValue={defaults.pointsDraw ?? 1} />
        </Field>
        <Field label="Loss">
          <Input name="pointsLoss" type="number" min={-10} max={10} defaultValue={defaults.pointsLoss ?? 0} />
        </Field>
      </div>
      <p className="mt-4 mb-2 text-sm font-medium">When level on points, separate by…</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <span className="w-8 shrink-0 text-muted">{i}.</span>
            <Select name={`tiebreak-${i}`} defaultValue={chosen[i - 1] ?? ""} className="min-w-0 flex-1 py-1.5">
              <option value="">{i === 1 ? "Nothing (seed order)" : "—"}</option>
              {Object.entries(TIEBREAKERS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        Head-to-head compares only the matches between the tied entries. With a shootout, the control room asks for its result
        before the knockout can be drawn.
      </p>
    </fieldset>
  );
}

/**
 * Handicap style plus the starts: a table per rank gap ("1 rank apart", …, "5+ apart") or one per pairing
 * of ranks ("1 v 2", "1 v 3", …), with a worked example.
 */
function HandicapFields({
  style,
  onStyle,
  starts,
  onStarts,
  defaultMatrix,
  raceTo,
  unit,
  pairs,
  locked,
}: {
  style: string;
  onStyle: (v: string) => void;
  starts: string[];
  onStarts: (v: string[]) => void;
  defaultMatrix: StartMatrix | null;
  raceTo: number;
  unit: string;
  pairs: boolean;
  locked: boolean;
}) {
  const [mode, setMode] = useState(defaultMatrix || pairs ? "PAIRS" : "GAP");
  const [size, setSize] = useState(Math.max(3, matrixSize(defaultMatrix)));
  const [matrix, setMatrix] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(defaultMatrix ?? {}).map(([k, v]) => [k, String(v)])),
  );
  // Blank boxes inherit the previous gap, matching how the server reads the table.
  const effective = fillBlankStarts(starts.map((v) => (v.trim() === "" ? NaN : Number(v) || 0)));
  const effectiveMatrix = Object.fromEntries(Object.entries(matrix).map(([k, v]) => [k, Number(v) || 0]));
  const rankWord = pairs ? "Group" : "Rank";
  const example = (rank1: number, rank2: number) => {
    const h = computeHandicap({ style, starts: effective, matrix: mode === "PAIRS" ? effectiveMatrix : null, raceTo, rank1, rank2 });
    return describeHandicap(h, `${rankWord} ${rank1}`, `${rankWord} ${rank2}`) ?? "level match";
  };
  const pairings: [number, number][] = [];
  for (let a = 1; a <= size; a++) for (let b = a + 1; b <= size; b++) pairings.push([a, b]);

  return (
    <fieldset className="rounded-xl border border-border p-4 sm:col-span-2" disabled={locked}>
      <legend className="px-1 text-sm font-semibold">Handicap</legend>
      {locked && <p className="mb-3 text-sm text-muted">Reset the draw to change the handicap.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Style"
          hint={pairs ? "Uses each pair's handicap group (1 = strongest), set when you enter the pair" : "Uses each player's rank for this discipline (1 = strongest)"}
        >
          <Select name="handicapStyle" value={style} onChange={(e) => onStyle(e.target.value)}>
            <option value="">Level (no handicap)</option>
            {Object.entries(HANDICAP_STYLES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {style && (
          <Field label="Starts set by">
            <Select name="handicapMode" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="GAP">How far apart they are ({rankWord.toLowerCase()} gap)</option>
              <option value="PAIRS">Each pairing ({rankWord} 1 v 2, 1 v 3, …)</option>
            </Select>
          </Field>
        )}
      </div>
      {style && mode === "GAP" && (
        <>
          <p className="mt-4 mb-2 text-sm font-medium">
            {style === "LONGER_RACE" ? `Extra ${unit} for the stronger side` : `Start (${unit})`} when they are…
          </p>
          <div className="grid grid-cols-5 gap-2">
            {starts.map((value, i) => (
              <label key={i} className="block">
                <span className="mb-1 block text-xs text-muted">
                  {i + 1}
                  {i === starts.length - 1 ? "+" : ""} apart
                </span>
                <Input
                  name={`start-${i + 1}`}
                  type="number"
                  min={0}
                  max={20}
                  value={value}
                  placeholder={String(effective[i - 1] ?? 0)}
                  onChange={(e) => onStarts(starts.map((s, j) => (j === i ? e.target.value : s)))}
                />
              </label>
            ))}
          </div>
        </>
      )}
      {style && mode === "PAIRS" && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">
              {style === "LONGER_RACE" ? `Extra ${unit} for the stronger side` : `Start (${unit})`} between {rankWord.toLowerCase()}s 1 to
            </span>
            <Input
              name="matrixSize"
              type="number"
              min={2}
              max={MAX_MATRIX_RANKS}
              value={size}
              onChange={(e) => setSize(Math.min(MAX_MATRIX_RANKS, Math.max(2, Number(e.target.value) || 2)))}
              className="w-20 py-1.5"
              aria-label={`Number of ${rankWord.toLowerCase()}s`}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {pairings.map(([a, b]) => (
              <label key={`${a}-${b}`} className="block">
                <span className="mb-1 block text-xs text-muted">
                  {a} v {b}
                </span>
                <Input
                  name={`pair-${a}-${b}`}
                  type="number"
                  min={0}
                  max={20}
                  value={matrix[matrixKey(a, b)] ?? ""}
                  placeholder="0"
                  onChange={(e) => setMatrix({ ...matrix, [matrixKey(a, b)]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </>
      )}
      {style && (
        <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span className="font-medium">First to {raceTo}:</span> {rankWord} 1 v {rankWord} 2 → {example(1, 2)}. {rankWord} 1 v{" "}
          {rankWord} 3 → {example(1, 3)}.
        </div>
      )}
      {/* A disabled fieldset doesn't submit, so carry the saved values through. */}
      {locked && (
        <>
          <input type="hidden" name="handicapStyle" value={style} />
          <input type="hidden" name="handicapMode" value={mode} />
          <input type="hidden" name="matrixSize" value={size} />
          {starts.map((v, i) => (
            <input key={i} type="hidden" name={`start-${i + 1}`} value={v} />
          ))}
          {pairings.map(([a, b]) => (
            <input key={`${a}-${b}`} type="hidden" name={`pair-${a}-${b}`} value={matrix[matrixKey(a, b)] ?? ""} />
          ))}
        </>
      )}
    </fieldset>
  );
}
