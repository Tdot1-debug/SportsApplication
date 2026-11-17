import { DemoReview } from "@/components/review/DemoReview";
import { PageHeader } from "@/components/ui";

export default async function DemoReviewPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Sample review workspace" subtitle="Synthetic test pattern with hand-written sample events. Edits stay in your browser tab and are discarded on reload." />
      <DemoReview initialTime={sp.t ? Number(sp.t) : undefined} />
    </>
  );
}
