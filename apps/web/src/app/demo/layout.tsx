import Link from "next/link";
import { Wordmark } from "@/components/ui";

export const metadata = { title: "Demo" };

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div role="note" className="bg-lime px-4 py-2 text-center text-sm font-semibold text-ink">
        DEMO MODE · Fictional sample data · Nothing here came from automated analysis · Changes are not saved
      </div>
      <header className="bg-ink">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 text-sm text-white">
          <Link href="/demo"><Wordmark dark /></Link>
          <nav className="flex gap-4 text-white/80">
            <Link href="/demo" className="hover:text-white">Overview</Link>
            <Link href="/demo/review" className="hover:text-white">Review</Link>
            <Link href="/demo/report" className="hover:text-white">Player report</Link>
            <Link href="/signup" className="rounded bg-lime px-3 py-1 font-semibold text-ink">Create account</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
