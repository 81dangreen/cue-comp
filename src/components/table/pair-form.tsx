"use client";

import { useActionState } from "react";
import { pairTabletAction } from "@/actions/table";

export function PairForm({ code }: { code?: string }) {
  const [state, action, pending] = useActionState(pairTabletAction, undefined);
  return (
    <form action={action} className="mt-8 space-y-4 text-left">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-white/70">Pairing code</span>
        <input
          name="code"
          defaultValue={code}
          required
          autoFocus={!code}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABC123"
          className="w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-center font-mono text-4xl tracking-[0.4em] uppercase outline-none placeholder:text-white/20 focus:border-emerald-300"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-white/70">Name this tablet (optional)</span>
        <input
          name="name"
          placeholder="e.g. Blue iPad"
          className="w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-lg outline-none placeholder:text-white/30 focus:border-emerald-300"
        />
      </label>
      {state?.error && <p className="rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-200">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-sky-400 py-4 text-xl font-bold text-black active:bg-sky-300 disabled:opacity-60"
      >
        {pending ? "Pairing…" : "Pair tablet"}
      </button>
    </form>
  );
}
