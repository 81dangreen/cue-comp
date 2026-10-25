"use client";

import { useState } from "react";
import { DISCIPLINES, FORMATS } from "@/lib/constants";
import { computeHandicap, describeHandicap, fillBlankStarts, HANDICAP_GAPS, HANDICAP_STYLES, startForGap } from "@/lib/handicap";
import { ActionForm, SubmitButton, type FormAction } from "../forms";
import { Field, Input, Select, Textarea } from "../ui";

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
};

export function TournamentForm({
  action,
  venues,
  defaults = {},
  submitLabel,
  lockStructure = false,
}: {
  action: FormAction;
  venues: { id: string; name: string }[];
  defaults?: TournamentDefaults;
  submitLabel: string;
  lockStructure?: boolean;
}) {
  const [format, setFormat] = useState(defaults.format ?? "DOUBLE_ELIM");
  const [raceTo, setRaceTo] = useState(String(defaults.raceTo ?? 5));
  const [handicapStyle, setHandicapStyle] = useState(defaults.handicapStyle ?? "");
  const [starts, setStarts] = useState<string[]>(() =>
    Array.from({ length: HANDICAP_GAPS }, (_, i) =>
      defaults.handicapStarts?.length ? String(startForGap(defaults.handicapStarts, i + 1)) : i === 0 ? "1" : "",
    ),
  );

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

      {format === "GROUPS_KO" && (
        <>
          <Field label="Number of groups">
            <Input name="groupCount" type="number" min={1} max={32} defaultValue={defaults.groupCount ?? 4} />
          </Field>
          <Field label="Qualifiers per group">
            <Input name="qualifiersPerGroup" type="number" min={1} max={8} defaultValue={defaults.qualifiersPerGroup ?? 2} />
          </Field>
        </>
      )}

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
      <Field label="Max players (optional)">
        <Input name="maxEntries" type="number" min={2} defaultValue={defaults.maxEntries ?? ""} />
      </Field>
      <Field label="Entry fee (optional)">
        <Input name="entryFee" defaultValue={defaults.entryFee ?? ""} placeholder="e.g. £10" />
      </Field>
      <Field label="Seeding" hint="Manual: set seeds on the entries page; unseeded players are drawn randomly">
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublic" defaultChecked={defaults.isPublic ?? true} />
          Show on the public site
        </label>
      </div>
      <HandicapFields
        style={handicapStyle}
        onStyle={setHandicapStyle}
        starts={starts}
        onStarts={setStarts}
        raceTo={Number(raceTo) || 1}
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

/** Handicap style plus the start table ("1 rank apart", "2 apart", …, "5+ apart"), with a worked example. */
function HandicapFields({
  style,
  onStyle,
  starts,
  onStarts,
  raceTo,
  locked,
}: {
  style: string;
  onStyle: (v: string) => void;
  starts: string[];
  onStarts: (v: string[]) => void;
  raceTo: number;
  locked: boolean;
}) {
  // Blank boxes inherit the previous gap, matching how the server reads the table.
  const effective = fillBlankStarts(starts.map((v) => (v.trim() === "" ? NaN : Number(v) || 0)));
  const example = (rank1: number, rank2: number) => {
    const h = computeHandicap({ style, starts: effective, raceTo, rank1, rank2 });
    return describeHandicap(h, `Rank ${rank1}`, `Rank ${rank2}`) ?? "level match";
  };

  return (
    <fieldset className="rounded-xl border border-border p-4 sm:col-span-2" disabled={locked}>
      <legend className="px-1 text-sm font-semibold">Handicap</legend>
      {locked && <p className="mb-3 text-sm text-muted">Reset the draw to change the handicap.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Style" hint="Uses each player's rank for this discipline (1 = strongest)">
          <Select name="handicapStyle" value={style} onChange={(e) => onStyle(e.target.value)}>
            <option value="">Level (no handicap)</option>
            {Object.entries(HANDICAP_STYLES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {style && (
        <>
          <p className="mt-4 mb-2 text-sm font-medium">
            {style === "LONGER_RACE" ? "Extra racks for the stronger player" : "Start (racks)"} when players are…
          </p>
          <div className="grid grid-cols-5 gap-2">
            {starts.map((value, i) => (
              <label key={i} className="block">
                <span className="mb-1 block text-xs text-muted">
                  {i + 1}
                  {i === starts.length - 1 ? "+" : ""} rank{i === 0 ? "" : "s"} apart
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
          <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <span className="font-medium">Race to {raceTo}:</span> Rank 1 v Rank 2 → {example(1, 2)}. Rank 1 v Rank 4 →{" "}
            {example(1, 4)}.
          </div>
        </>
      )}
      {/* A disabled fieldset doesn't submit, so carry the saved values through. */}
      {locked && (
        <>
          <input type="hidden" name="handicapStyle" value={style} />
          {starts.map((v, i) => (
            <input key={i} type="hidden" name={`start-${i + 1}`} value={v} />
          ))}
        </>
      )}
    </fieldset>
  );
}
