"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { getBrowserClient } from "@/lib/supabase/client";

export function ResetForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password !== String(f.get("confirm"))) return setError("Passwords do not match.");
    setBusy(true);
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    await supabase.auth.signOut();
    router.replace("/login?reset=1");
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div>
        <label className="label" htmlFor="password">New password</label>
        <input className="field" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm password</label>
        <input className="field" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>
    </form>
  );
}
