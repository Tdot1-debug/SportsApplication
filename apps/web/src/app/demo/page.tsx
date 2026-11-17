import Link from "next/link";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { DEMO_PLAYERS } from "@/lib/demo-data";

export default function DemoHome() {
  return (
    <>
      <PageHeader
        title="Explore Smarvii Sports"
        subtitle="This demo uses a synthetic test-pattern video and hand-written sample labels so you can try the review workflow without an account. It does not call any AI service and does not use real athletes."
        actions={<ButtonLink href="/demo/review" variant="lime">Open sample review</ButtonLink>}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="font-semibold">1. Upload</h2>
          <p className="mt-1 text-sm text-muted">In the real app coaches choose a player (or mark footage unassigned), a drill and a file from their phone. Uploads are resumable and verified on the server.</p>
        </Card>
        <Card>
          <h2 className="font-semibold">2. Review</h2>
          <p className="mt-1 text-sm text-muted">Timestamped events, a zoomable timeline, outcome buttons, merge and split. <Link className="underline" href="/demo/review">Try it with sample events.</Link></p>
        </Card>
        <Card>
          <h2 className="font-semibold">3. Publish</h2>
          <p className="mt-1 text-sm text-muted">Athletes see only approved, published results with the denominator stated. <Link className="underline" href="/demo/report">See a sample report.</Link></p>
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="font-semibold">Sample roster <Badge>Fictional</Badge></h2>
        <ul className="mt-2 divide-y divide-line text-sm">
          {DEMO_PLAYERS.map((p) => <li key={p.id} className="py-2">{p.name} · {p.team} · {p.position}</li>)}
        </ul>
      </Card>
    </>
  );
}
