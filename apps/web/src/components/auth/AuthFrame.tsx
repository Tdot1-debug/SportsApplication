import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui";

export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-ink p-10 text-white lg:flex">
        <Link href="/"><Wordmark dark /></Link>
        <div>
          <p className="text-4xl font-bold leading-tight">Capture practice.<br />Review progress.</p>
          <p className="mt-4 max-w-sm text-white/60">Private practice video review for coaches. Suggestions are drafts until a coach approves them.</p>
        </div>
        <p className="text-xs text-white/40">Pilot prototype</p>
      </aside>
      <main id="main" className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <Link href="/" className="lg:hidden"><Wordmark /></Link>
          <h1 className="mt-6 text-2xl font-bold lg:mt-0">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 text-sm text-muted">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
