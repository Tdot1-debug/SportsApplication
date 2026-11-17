import { ButtonLink, Card, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Upload guide" };

const steps = [
  ["Record with your glasses", "Start and stop recording on the glasses as usual. Keep each clip under 5 minutes. For analysis, keep the athlete's whole body (and for pitching, the target) in view where you can."],
  ["Transfer with the HeyCyan companion app", "Open the HeyCyan app on your phone and import the clips from the glasses using the app's own transfer feature."],
  ["Save the video to your phone", "In the HeyCyan app, save or export each clip to your phone's photo library or Files. Smarvii cannot read videos that only exist inside the HeyCyan app."],
  ["Upload to Smarvii Sports", "Open Upload here, pick the player (or mark it unassigned), choose the drill, then tap Choose and select the saved videos with your phone's standard picker."],
  ["Review and publish", "Open the recording, request analysis for an excerpt if your plan includes it, correct the suggestions, approve, confirm the player, then publish."],
];

export default function Guide() {
  return (
    <>
      <PageHeader title="Upload guide" subtitle="From glasses to a reviewed report." actions={<ButtonLink href="/app/upload" variant="lime">Go to upload</ButtonLink>} />
      <div className="mb-4">
        <Notice tone="info" title="No direct glasses connection">
          Smarvii Sports does not connect to the glasses or to HeyCyan and does not sync automatically. Every recording is uploaded manually from your phone or computer.
        </Notice>
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {steps.map(([t, d], i) => (
          <li key={t}>
            <Card className="h-full">
              <p className="text-xs font-semibold text-muted">Step {i + 1}</p>
              <h2 className="font-semibold">{t}</h2>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </Card>
          </li>
        ))}
      </ol>
      <Card className="mt-6">
        <h2 className="font-semibold">Recording tips for useful analysis</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Gym tests: whole body visible, minimal head movement, a short pause between sets.</li>
          <li>Hitting: keep the bat and ball path in frame. Contact is only suggested when it is visible.</li>
          <li>Underhand pitching: keep the target (catcher&apos;s glove or zone) in frame and enter the intended target. Results are not inferred from the pitcher&apos;s motion alone.</li>
          <li>Accepted files: MP4 or MOV, up to 500 MiB and 5 minutes each. Analysis covers up to 60 seconds per request.</li>
        </ul>
      </Card>
    </>
  );
}
