"use client";

import { useActionState, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, cx } from "./ui";

export type ActionResult = { error?: string; message?: string } | undefined;
export type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/** A form bound to a server action, showing its error/success message inline. */
export function ActionForm({
  action,
  children,
  className,
  id,
  resetOnSuccess = false,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  id?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state && !state.error) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} id={id} action={formAction} className={className}>
      {children}
      {state?.error && <p className="mt-3 text-sm text-live">{state.error}</p>}
      {state?.message && !state.error && <p className="mt-3 text-sm text-accent">{state.message}</p>}
    </form>
  );
}

export function SubmitButton({ children, pendingText, ...props }: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? pendingText ?? "Saving…" : children}
    </Button>
  );
}

/** Runs a (pre-bound) server action on click and shows its message. */
export function ActionButton({
  action,
  confirm,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "action"> & { action: () => Promise<ActionResult>; confirm?: string }) {
  const [state, formAction, pending] = useActionState(async () => action(), undefined);
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-start"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <Button type="submit" disabled={pending} {...props}>
        {children}
      </Button>
      {state?.error && <span className="mt-1 text-xs text-live">{state.error}</span>}
      {state?.message && !state.error && <span className="mt-1 text-xs text-accent">{state.message}</span>}
    </form>
  );
}

/** Button that asks for confirmation before submitting its form. */
export function ConfirmButton({ message, className, ...props }: ComponentProps<typeof Button> & { message: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className={cx(className)}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      {...props}
    />
  );
}
