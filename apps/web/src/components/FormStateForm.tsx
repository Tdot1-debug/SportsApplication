"use client";
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, Notice } from "@/components/ui";

type State = { error?: string; ok?: string } | undefined;

export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  className = "space-y-4",
  submitVariant = "primary",
}: {
  action: (state: State, form: FormData) => Promise<State>;
  children: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  submitVariant?: "primary" | "lime" | "secondary" | "danger";
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="ok">{state.ok}</Notice> : null}
      {children}
      <Submit label={submitLabel} pending={pendingLabel} variant={submitVariant} />
    </form>
  );
}

function Submit({ label, pending, variant }: { label: string; pending: string; variant: "primary" | "lime" | "secondary" | "danger" }) {
  const { pending: isPending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={isPending}>
      {isPending ? pending : label}
    </Button>
  );
}
