"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/ui";

type Item = { href: string; label: string };

export function AppNav({ items, orgName, orgs, activeOrg, email, roleLabel }: {
  items: Item[]; orgName: string; orgs: { id: string; name: string }[]; activeOrg: string; email: string; roleLabel: string;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((it) => {
        const active = path === it.href || path.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-lime text-ink" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
  const footer = (
    <div className="space-y-3 border-t border-white/10 pt-4 text-xs text-white/60">
      {orgs.length > 1 ? (
        <form action="/api/org/switch" method="post" className="space-y-1">
          <label htmlFor="org-switch" className="block">Organisation</label>
          <div className="flex gap-1">
            <select id="org-switch" name="org" defaultValue={activeOrg} className="w-full rounded bg-ink-3 px-2 py-1 text-white">
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button className="rounded bg-white/10 px-2 text-white" type="submit">Go</button>
          </div>
        </form>
      ) : null}
      <p className="truncate" title={email}>{email}</p>
      <p>{roleLabel}</p>
      <form action="/auth/signout" method="post"><button className="underline hover:text-white" type="submit">Sign out</button></form>
    </div>
  );
  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        <Link href="/app/dashboard"><Wordmark dark /></Link>
        <button
          type="button"
          className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open ? (
        <div id="mobile-nav" className="fixed inset-x-0 top-[52px] z-30 space-y-4 bg-ink px-4 pb-6 pt-2 lg:hidden">
          <p className="px-3 text-xs uppercase tracking-wide text-white/50">{orgName}</p>
          {nav}
          {footer}
        </div>
      ) : null}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between bg-ink p-4 lg:flex">
        <div className="space-y-6">
          <Link href="/app/dashboard" className="block px-2 pt-1"><Wordmark dark /></Link>
          <p className="px-3 text-xs uppercase tracking-wide text-white/50">{orgName}</p>
          {nav}
        </div>
        {footer}
      </aside>
    </>
  );
}
