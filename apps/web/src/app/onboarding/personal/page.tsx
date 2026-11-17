import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/FormStateForm";
import { Card, Wordmark } from "@/components/ui";
import { listMemberships } from "@/lib/auth";
import { createPersonalWorkspace } from "../actions";

export const metadata = { title: "Personal training workspace" };

const SPORTS = [
  ["strength", "Strength training"],
  ["tennis", "Tennis"],
  ["boxing", "Boxing"],
  ["softball", "Softball"],
  ["other", "Other movement"],
] as const;

export default async function PersonalOnboarding() {
  const { memberships, user } = await listMemberships();
  if (memberships.some((m) => m.org_kind === "personal" && m.role === "owner")) redirect("/app/dashboard");
  const name = (user.user_metadata?.full_name as string | undefined) ?? "";
  return (
    <main id="main" className="mx-auto max-w-2xl px-5 py-10">
      <Wordmark />
      <h1 className="mt-8 text-3xl font-bold">Your personal training workspace</h1>
      <p className="mt-2 text-sm text-muted">Private to you. Nobody else sees your videos or notes unless you invite a coach, and you can remove a coach at any time. <Link href="/onboarding" className="underline">Setting up a team instead?</Link></p>
      <Card className="mt-6">
        <ActionForm action={createPersonalWorkspace} submitLabel="Create my workspace" pendingLabel="Creating…">
          <div>
            <label className="label" htmlFor="display_name">Your name</label>
            <input className="field" id="display_name" name="display_name" defaultValue={name} required maxLength={120} />
          </div>
          <fieldset>
            <legend className="label">Sports you train</legend>
            <div className="flex flex-wrap gap-3 text-sm">
              {SPORTS.map(([v, l]) => <label key={v} className="flex items-center gap-1"><input type="checkbox" name="sports" value={v} /> {l}</label>)}
            </div>
            <p className="hint">Automated analysis is only available for activities that have been evaluated. Other activities still get private video review, notes and history.</p>
          </fieldset>
          <div>
            <label className="label" htmlFor="goal">A training goal (optional)</label>
            <input className="field" id="goal" name="goal" maxLength={500} placeholder="e.g. Keep a neutral neck on kettlebell deadlifts" />
          </div>
          <fieldset className="space-y-3 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold">Confirmations</legend>
            <label className="flex gap-3 text-sm"><input type="checkbox" name="adult" required className="mt-1" /><span>I am 18 or older. (Accounts for under-18s are not available yet.)</span></label>
            <label className="flex gap-3 text-sm"><input type="checkbox" name="attest" required className="mt-1" /><span>The videos I upload show me, or people who have agreed to be recorded.</span></label>
            <label className="flex gap-3 text-sm"><input type="checkbox" name="notice" required className="mt-1" /><span>I have read the <Link href="/privacy" target="_blank" className="underline">data use notice</Link>. Automated analysis is experimental, is not medical advice, and my own review is not a coach&apos;s approval.</span></label>
          </fieldset>
        </ActionForm>
      </Card>
    </main>
  );
}
