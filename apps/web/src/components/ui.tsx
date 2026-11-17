import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "lime";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-3 disabled:bg-ink/40",
  lime: "bg-lime text-ink hover:brightness-95 disabled:opacity-50",
  secondary: "border border-line bg-white text-ink hover:bg-paper disabled:opacity-50",
  danger: "bg-danger text-white hover:brightness-110 disabled:opacity-50",
  ghost: "text-ink hover:bg-ink/5 disabled:opacity-50",
};
const BASE = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed";

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function Card({ className = "", children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-5 shadow-[0_1px_0_rgba(0,0,0,0.03)] ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "danger" | "ok"; title?: string; children?: ReactNode }) {
  const tones = {
    info: "border-line bg-white",
    warn: "border-amber-300 bg-amber-50",
    danger: "border-red-300 bg-red-50",
    ok: "border-green-300 bg-green-50",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-0.5 text-ink/80" : ""}>{children}</div> : null}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "lime" | "warn" | "danger" | "ok" | "dark" | "ai" }) {
  const tones = {
    neutral: "bg-paper text-ink border-line",
    lime: "bg-lime text-ink border-lime",
    warn: "bg-amber-50 text-warn border-amber-200",
    danger: "bg-red-50 text-danger border-red-200",
    ok: "bg-green-50 text-ok border-green-200",
    dark: "bg-ink text-white border-ink",
    ai: "bg-violet-50 text-violet-900 border-violet-200",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
      {label}
    </span>
  );
}

export function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-muted">{detail}</p> : null}
    </div>
  );
}

export function Wordmark({ dark = false, size = "md" }: { dark?: boolean; size?: "md" | "lg" }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 font-[family-name:var(--font-display)] tracking-tight ${size === "lg" ? "text-3xl" : "text-lg"}`}>
      <span className={dark ? "text-white" : "text-ink"}>SMARVII</span>
      <span className={`rounded px-1.5 py-0.5 text-[0.7em] ${dark ? "bg-lime text-ink" : "bg-ink text-lime"}`}>SPORTS</span>
    </span>
  );
}
