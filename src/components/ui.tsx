import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const buttonStyles = {
  primary: "bg-accent text-accent-fg shadow-sm hover:opacity-90",
  secondary: "bg-surface border border-border text-foreground shadow-sm hover:bg-surface-2",
  danger: "bg-surface border border-live/40 text-live hover:bg-live/10",
  ghost: "hover:bg-surface-2",
};
type ButtonVariant = keyof typeof buttonStyles;

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:pointer-events-none";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

/**
 * A flat, square-cornered section that runs edge to edge on phones (cancelling the page's side
 * padding) and sits within the content column from tablet width up.
 */
export const panel = "-mx-4 overflow-hidden border-y border-border bg-surface sm:mx-0 sm:border-x";

/**
 * A flat section (see `panel`). Centred cards (forms like log in, with `mx-auto`) keep a full
 * border instead of running to the screen edges.
 */
export function Card({ className, ...props }: ComponentProps<"div">) {
  const centred = className?.split(/\s+/).includes("mx-auto");
  return <div className={cx(centred ? "border border-border bg-surface" : panel, className)} {...props} />;
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const badgeTones = {
  neutral: "border border-border bg-surface-2 text-foreground",
  accent: "bg-accent-soft text-accent",
  pop: "bg-pop text-pop-fg",
  live: "bg-live text-live-fg",
  warn: "bg-warn/15 text-warn",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeTones[tone])}>
      {children}
    </span>
  );
}

export function LiveBadge() {
  return (
    <Badge tone="live">
      <span className="live-dot h-1.5 w-1.5 rounded-full bg-live-fg" /> LIVE
    </Badge>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputBase =
  "rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

/** Inputs are full width unless the caller sets a width (e.g. "w-16"), which would otherwise lose to w-full. */
function fieldClasses(className?: string) {
  const sized = className?.split(/\s+/).some((c) => /^w-/.test(c) || c === "flex-1");
  return cx(inputBase, !sized && "w-full", className);
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={fieldClasses(className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={fieldClasses(className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={fieldClasses(cx("min-h-24", className))} {...props} />;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-border/60", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="flex items-center gap-2.5 font-display text-2xl font-bold tracking-wide uppercase">
        <span className="h-6 w-1.5 rounded-full bg-pop" aria-hidden />
        {children}
      </h2>
      {action}
    </div>
  );
}
