"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { getBrowserClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safe-next";

export function SignupForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    setBusy(true);
    setError(null);
    const target = safeNext(next, "/onboarding");
    const { data, error } = await getBrowserClient().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
        data: { full_name: String(form.get("name") || "") },
      },
    });
    setBusy(false);
    if (error) return setError(error.message);
    if (data.session) {
      router.replace(target);
      router.refresh();
    } else {
      setSent(email);
    }
  }

  if (sent) {
    return (
      <Notice tone="ok" title="Check your email">
        We sent a confirmation link to {sent}. Open it on this device to finish creating your account.
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div>
        <label className="label" htmlFor="name">Your name</label>
        <input className="field" id="name" name="name" autoComplete="name" required maxLength={120} />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="field" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="field" id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <p className="hint">At least 8 characters.</p>
      </div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating account…" : "Create account"}</Button>
    </form>
  );
}
