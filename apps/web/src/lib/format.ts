export function fmtSeconds(s: number | string | null | undefined, digits = 1): string {
  if (s === null || s === undefined || s === "") return "—";
  const n = Number(s);
  if (!Number.isFinite(n)) return "—";
  if (n < 60) return `${n.toFixed(digits)} s`;
  const m = Math.floor(n / 60);
  const rest = n - m * 60;
  return `${m}:${rest.toFixed(digits).padStart(digits ? digits + 3 : 2, "0")}`;
}

export function fmtClock(s: number): string {
  const n = Math.max(0, s);
  const m = Math.floor(n / 60);
  const sec = n - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, "0")}`;
}

export function fmtMinutes(seconds: number | string | null | undefined): string {
  const n = Number(seconds ?? 0);
  return `${(n / 60).toFixed(1)} min`;
}

export function fmtBytes(b: number | string | null | undefined): string {
  const n = Number(b ?? 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024 ** 3).toFixed(2)} GiB`;
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Postgres raise messages arrive in error.message; strip noise for display. */
export function errorMessage(e: unknown): string {
  if (!e) return "Something went wrong";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Something went wrong";
}

/** Request-time clock helpers for server components (kept out of render bodies for lint purity rules). */
export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
export function secondsSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 1000;
}
