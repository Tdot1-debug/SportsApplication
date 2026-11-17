import Link from "next/link";
import { ButtonLink, Wordmark } from "@/components/ui";

export default async function Home({ searchParams }: { searchParams: Promise<{ account_deleted?: string }> }) {
  const { account_deleted } = await searchParams;
  return (
    <div className="min-h-dvh bg-ink text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Wordmark dark />
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/demo" className="rounded-lg px-3 py-2 text-white/80 hover:text-white">Demo</Link>
          <Link href="/login" className="rounded-lg px-3 py-2 text-white/80 hover:text-white">Sign in</Link>
          <ButtonLink href="/signup" variant="lime">Create account</ButtonLink>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-5 pb-20 pt-10 sm:pt-20">
        {account_deleted ? (
          <p role="status" className="mb-8 rounded-xl border border-lime/40 bg-white/5 px-4 py-3 text-sm">Your account has been deleted.</p>
        ) : null}
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-lime">Pilot prototype</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          Capture practice.<br />Review progress.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-white/75">
          Smarvii Sports turns practice footage from a phone or wearable camera (softball, gym sessions or any movement you describe) into a private video library with suggested rep counts,
          coach-correctable outcomes and draft technique notes. Coaches review and approve everything before an athlete sees it.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/signup" variant="lime">Start a program</ButtonLink>
          <ButtonLink href="/demo" variant="secondary" className="!bg-transparent !text-white border-white/30 hover:!bg-white/10">
            Explore the labelled demo
          </ButtonLink>
        </div>

        <section className="mt-20 grid gap-4 sm:grid-cols-3" aria-label="How it works">
          {[
            ["1. Record and transfer", "Record on a phone or camera glasses, save the clip to your phone or computer, then upload it here with the normal file picker."],
            ["2. Review suggestions", "Automated analysis (where enabled) suggests timestamped reps, swings or pitches, or reps of any movement you describe. Every suggestion is a draft you can correct, merge, split or delete."],
            ["3. Approve and share", "Only coach-approved results reach the athlete, with the sample and denominator stated plainly."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-white/10 bg-ink-2 p-5">
              <h2 className="font-semibold text-lime">{t}</h2>
              <p className="mt-2 text-sm text-white/70">{d}</p>
            </div>
          ))}
        </section>

        <section className="mt-12 rounded-2xl border border-white/10 bg-ink-2 p-6 text-sm text-white/70">
          <h2 className="font-semibold text-white">What this pilot does not do</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>No direct glasses integration or automatic sync. Uploads are manual.</li>
            <li>No pitch speed, exit velocity, spin, joint angles, injury prediction or talent scores.</li>
            <li>No facial recognition: coaches assign every recording to a player.</li>
            <li>Automated analysis is experimental and always requires coach review.</li>
          </ul>
        </section>
      </main>
      <footer className="mx-auto max-w-6xl px-5 pb-10 text-xs text-white/50">
        <Link href="/privacy" className="underline">Data use notice</Link> · Smarvii Sports pilot
      </footer>
    </div>
  );
}
