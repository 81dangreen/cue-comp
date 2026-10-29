"use client";

import { useActionState, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { LinkResult } from "@/actions/team";
import { SubmitButton } from "../forms";
import { Button, cx, Input } from "../ui";

const noSubscribe = () => () => {};

/** A one-time link with Copy and (on phones) Share, so it can go straight into WhatsApp or a text. */
export function ShareLink({ link, title, note }: { link: string; title: string; note: string }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Share sheets exist on phones and tablets; the server render never offers one.
  const canShare = useSyncExternalStore(noSubscribe, () => "share" in navigator, () => false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      input.current?.select();
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-accent/40 bg-accent-soft p-3">
      <p className="text-sm font-semibold">{title}</p>
      <Input ref={input} readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" aria-label="Link" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
        {canShare && (
          <Button type="button" variant="secondary" onClick={() => navigator.share({ title, url: link }).catch(() => {})}>
            Share…
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}

/** A form that creates a link (e.g. an invite) and then shows it ready to share. */
export function LinkForm({
  action,
  children,
  title,
  note,
  className,
}: {
  action: (prev: LinkResult, formData: FormData) => Promise<LinkResult>;
  children: ReactNode;
  title: string;
  note: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <div className={cx("space-y-3", className)}>
      <form action={formAction} className="space-y-3">
        {children}
      </form>
      {state?.error && <p className="text-sm text-live">{state.error}</p>}
      {state?.link && <ShareLink key={state.link} link={state.link} title={title} note={note} />}
    </div>
  );
}

/** A button that creates a link for one person (e.g. a password reset) and shows it beneath. */
export function LinkButton({
  action,
  label,
  title,
  note,
}: {
  action: () => Promise<LinkResult>;
  label: string;
  title: string;
  note: string;
}) {
  const [state, formAction] = useActionState(async () => action(), undefined);
  return (
    <div className="space-y-2">
      <form action={formAction}>
        <SubmitButton variant="ghost" className="px-2.5 py-1 text-xs" pendingText="Creating…">
          {label}
        </SubmitButton>
      </form>
      {state?.error && <p className="text-xs text-live">{state.error}</p>}
      {state?.link && <ShareLink key={state.link} link={state.link} title={title} note={note} />}
    </div>
  );
}
