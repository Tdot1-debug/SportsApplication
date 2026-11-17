"use client";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { getBrowserClient } from "@/lib/supabase/client";

export function ForgotForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const email = String(new FormData(e.currentTarget).get("email"));
    const { error } = await getBrowserClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
  }
  if (done) return <Notice tone="ok" title="Check your email">If an account exists for that address, a reset link is on its way.</Notice>;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="field" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
    </form>
  );
}
