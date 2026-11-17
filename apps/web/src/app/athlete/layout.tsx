import Link from "next/link";
import { Wordmark } from "@/components/ui";
import { listMemberships, requireUser } from "@/lib/auth";

export default async function AthleteLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser("/athlete");
  const { memberships } = await listMemberships();
  const staff = memberships.some((m) => m.role === "owner" || m.role === "coach");
  return (
    <div className="min-h-dvh">
      <header className="bg-ink">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3 text-sm text-white">
          <Link href="/athlete"><Wordmark dark /></Link>
          <div className="flex items-center gap-3 text-white/70">
            <span className="hidden sm:inline">{user.email}</span>
            {staff ? <Link href="/app/dashboard" className="underline hover:text-white">Coach workspace</Link> : null}
            <Link href="/account" className="underline hover:text-white">Account</Link>
            <form action="/auth/signout" method="post"><button type="submit" className="underline hover:text-white">Sign out</button></form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
