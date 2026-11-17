"use client";
import { useState, useTransition } from "react";
import { Button, Notice } from "@/components/ui";

/** Two-step inline confirmation (no browser dialogs) that calls a server action. */
export function ConfirmButton({ action, label, confirmLabel = "Confirm", variant = "secondary", prompt }: {
  action: () => Promise<void>; label: string; confirmLabel?: string; variant?: "secondary" | "danger" | "primary"; prompt?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!armed) return <Button type="button" variant={variant} onClick={() => setArmed(true)}>{label}</Button>;
  return (
    <div className="space-y-2">
      {prompt ? <p className="text-sm">{prompt}</p> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex gap-2">
        <Button type="button" variant={variant === "danger" ? "danger" : "primary"} disabled={pending}
          onClick={() => start(async () => { try { await action(); setArmed(false); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } })}>
          {pending ? "Working…" : confirmLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setArmed(false)}>Cancel</Button>
      </div>
    </div>
  );
}
