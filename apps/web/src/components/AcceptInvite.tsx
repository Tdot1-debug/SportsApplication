"use client";
import { useState, useTransition } from "react";
import { Button, Notice } from "@/components/ui";

export function AcceptInvite({ accept }: { accept: () => Promise<{ error?: string } | undefined> }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button variant="lime" disabled={pending} onClick={() => start(async () => { const r = await accept(); if (r?.error) setError(r.error); })}>
        {pending ? "Accepting…" : "Accept invitation"}
      </Button>
    </div>
  );
}
