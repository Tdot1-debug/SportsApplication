import { ActionForm } from "@/components/FormStateForm";
import { Card, Wordmark } from "@/components/ui";
import { requireOwnerContext } from "@/lib/auth";
import { choosePilotAccess } from "../actions";

export const metadata = { title: "Pilot access" };

export default async function AccessPage() {
  const { membership } = await requireOwnerContext();
  return (
    <main id="main" className="mx-auto max-w-2xl px-5 py-10">
      <Wordmark />
      <h1 className="mt-8 text-3xl font-bold">Pilot access for {membership.org_name}</h1>
      <p className="mt-2 text-sm text-muted">Step 2 of 2. Manual review (upload, label reps, publish reports) works on every plan. Automated analysis needs a pilot or evaluation allowance.</p>
      <Card className="mt-6">
        <ActionForm action={choosePilotAccess} submitLabel="Continue" pendingLabel="Saving…">
          <fieldset className="space-y-3">
            <legend className="sr-only">Choose access</legend>
            <label className="flex gap-3 rounded-xl border border-line p-4 text-sm has-[:checked]:border-ink">
              <input type="radio" name="choice" value="code" defaultChecked className="mt-1" />
              <span>
                <span className="font-semibold">I have a pilot access code</span>
                <input className="field mt-2" name="code" placeholder="Pilot code" autoComplete="off" aria-label="Pilot access code" />
                <span className="hint block">Founding pilot: provisional allowance of 120 analysed minutes per month.</span>
              </span>
            </label>
            <label className="flex gap-3 rounded-xl border border-line p-4 text-sm has-[:checked]:border-ink">
              <input type="radio" name="choice" value="evaluation" className="mt-1" />
              <span>
                <span className="font-semibold">Start the 30-day evaluation</span>
                <span className="hint block">One per organisation. 30 analysed minutes in total during the evaluation; no payment details needed.</span>
              </span>
            </label>
            <label className="flex gap-3 rounded-xl border border-line p-4 text-sm has-[:checked]:border-ink">
              <input type="radio" name="choice" value="manual" className="mt-1" />
              <span>
                <span className="font-semibold">Continue with manual review only</span>
                <span className="hint block">You can activate an evaluation or redeem a code later in Settings.</span>
              </span>
            </label>
          </fieldset>
        </ActionForm>
      </Card>
    </main>
  );
}
