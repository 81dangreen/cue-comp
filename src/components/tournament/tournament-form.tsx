"use client";

import { useState } from "react";
import { DISCIPLINES, FORMATS } from "@/lib/constants";
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
        <Input name="raceTo" type="number" min={1} max={50} defaultValue={defaults.raceTo ?? 5} required readOnly={lockStructure} />
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
