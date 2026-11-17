import Link from "next/link";
import { Wordmark } from "@/components/ui";

export const metadata = { title: "Data use notice" };

export default function Privacy() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/"><Wordmark /></Link>
      <h1 className="mt-8 text-3xl font-bold">Data use notice</h1>
      <p className="mt-2 text-sm text-muted">Plain-language summary for the Smarvii Sports pilot (version 2026-11-v1). This is not legal advice or a certification.</p>
      <div className="prose mt-6 space-y-4 text-sm leading-6">
        <p><strong>What we store.</strong> Practice recordings your coaches upload, the roster details they enter, review labels and approved reports. Recordings are kept in private storage and played back through short-lived signed links.</p>
        <p><strong>Who can see it.</strong> Organisation owners and the coaches they assign to a team. Athletes only see their own published reports and recordings a coach explicitly shares with them. Support staff do not get automatic access to recordings.</p>
        <p><strong>Automated analysis.</strong> When enabled, still frames sampled from a selected excerpt (up to 60 seconds) are sent to an AI vision provider (currently Google Gemini) to draft suggestions. While we use the provider&apos;s free tier, Google may use those frames to improve its products and its staff may review them. Suggestions are drafts; a coach must review and approve them. We do not use facial recognition or identify people from appearance.</p>
        <p><strong>Permission.</strong> The organisation owner attests that they have permission to record participants and will handle consent as their program requires. The app records consent status per player but does not verify it.</p>
        <p><strong>Retention and deletion.</strong> Each organisation sets a retention period (default 365 days). Deleting a recording stops processing and removes the original, derived files and analysis results. Database backups held by the hosting provider may retain data for the provider&apos;s backup window.</p>
        <p><strong>Export.</strong> Owners can export organisation metadata at any time from Settings.</p>
      </div>
    </main>
  );
}
