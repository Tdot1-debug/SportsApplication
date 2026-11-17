"use client";
import { Button, Notice } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-4">
      <Notice tone="danger" title="This page could not load">
        {error.message || "An unexpected error occurred."}
        {error.digest ? <span className="block text-xs text-muted">Reference: {error.digest}</span> : null}
      </Notice>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
