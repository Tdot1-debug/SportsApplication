import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/FormStateForm";
import { Card, Wordmark } from "@/components/ui";
import { listMemberships } from "@/lib/auth";
import { createProgram } from "./actions";

export const metadata = { title: "Set up your program" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const sp = await searchParams;
  const { memberships, user } = await listMemberships();
  if (!sp.new && memberships.some((m) => m.role !== "athlete")) redirect("/app/dashboard");
  const name = (user.user_metadata?.full_name as string | undefined) ?? "";
  return (
    <main id="main" className="mx-auto max-w-2xl px-5 py-10">
      <Wordmark />
      <h1 className="mt-8 text-3xl font-bold">How will you use Smarvii?</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href="/onboarding/personal" className="rounded-2xl border border-line p-4 hover:border-ink">
          <span className="block font-semibold">Just me: personal training</span>
          <span className="mt-1 block text-sm text-muted">A private workspace for your own videos, notes, goals and progress. Invite a coach later if you want, and remove them any time.</span>
        </Link>
        <a href="#team-setup" className="rounded-2xl border border-ink bg-lime/20 p-4">
          <span className="block font-semibold">A team, club or program</span>
          <span className="mt-1 block text-sm text-muted">For coaches: rosters, teams, athlete invitations and coach-approved reports.</span>
        </a>
      </div>
      <h2 id="team-setup" className="mt-10 text-2xl font-bold">Set up your program</h2>
      <p className="mt-2 text-sm text-muted">Step 1 of 2. You can add more teams and invite another coach later.</p>
      <Card className="mt-6">
        <ActionForm action={createProgram} submitLabel="Create program" pendingLabel="Creating…">
          <div>
            <label className="label" htmlFor="display_name">Your name (shown to your staff)</label>
            <input className="field" id="display_name" name="display_name" defaultValue={name} maxLength={120} />
          </div>
          <div>
            <label className="label" htmlFor="name">Program name</label>
            <input className="field" id="name" name="name" required minLength={2} maxLength={120} placeholder="e.g. Westfield Softball" />
          </div>
          <div>
            <label className="label" htmlFor="sport">Primary sport</label>
            <select className="field" id="sport" name="sport" defaultValue="softball">
              <option value="softball">Softball</option>
              <option value="gym">Gym / strength</option>
              <option value="multi">Multiple / other movement</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="team">First team name</label>
            <input className="field" id="team" name="team" required maxLength={120} placeholder="e.g. Varsity" />
          </div>
          <fieldset className="space-y-3 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold">Permissions</legend>
            <label className="flex gap-3 text-sm">
              <input type="checkbox" name="attest" required className="mt-1" />
              <span>I confirm my program has permission to record the participants we upload, and that we will obtain any consent our school, club or local rules require.</span>
            </label>
            <label className="flex gap-3 text-sm">
              <input type="checkbox" name="notice" required className="mt-1" />
              <span>I have read the <Link href="/privacy" target="_blank" className="underline">data use notice</Link>. I understand automated analysis is experimental and needs coach review.</span>
            </label>
          </fieldset>
        </ActionForm>
      </Card>
    </main>
  );
}
