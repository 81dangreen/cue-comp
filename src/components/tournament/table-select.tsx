"use client";

import { useActionState, useRef } from "react";
import type { FormAction } from "../forms";

/** Dropdown that assigns a table to a match as soon as it changes. */
export function TableSelect({
  action,
  tables,
  value,
}: {
  action: FormAction;
  tables: { id: string; name: string; busy: boolean }[];
  value: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={formAction} className="inline-flex flex-col">
      {/* Keyed on the value so a table assigned elsewhere (e.g. by auto-pilot) shows after a refresh. */}
      <select
        key={value ?? ""}
        name="tableId"
        defaultValue={value ?? ""}
        disabled={pending}
        onChange={() => ref.current?.requestSubmit()}
        className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
        aria-label="Table"
      >
        <option value="">No table</option>
        {tables.map((t) => (
          <option key={t.id} value={t.id} disabled={t.busy && t.id !== value}>
            {t.name}
            {t.busy && t.id !== value ? " (in use)" : ""}
          </option>
        ))}
      </select>
      {state?.error && <span className="mt-1 max-w-40 text-[11px] text-live">{state.error}</span>}
    </form>
  );
}
