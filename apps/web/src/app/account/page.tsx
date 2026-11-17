import Link from "next/link";
import { ActionForm } from "@/components/FormStateForm";
import { Card, Wordmark } from "@/components/ui";
import { listMemberships } from "@/lib/auth";
import { deleteAccount } from "./actions";

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  const { user, memberships } = await listMemberships();
  const staff = memberships.some((m) => m.role === "owner" || m.role === "coach");
  const athlete = memberships.some((m) => m.role === "athlete");
  const soleTeamOwner = memberships.filter((m) => m.role === "owner" && m.org_kind === "team");
  const personal = memberships.filter((m) => m.role === "owner" && m.org_kind === "personal");
  return (
    <main id="main" className="mx-auto max-w-2xl px-5 py-10">
      <Link href={staff ? "/app/dashboard" : athlete ? "/athlete" : "/onboarding"}><Wordmark /></Link>
      <h1 className="mt-8 text-3xl font-bold">Your account</h1>
      <p className="mt-2 text-sm text-muted">{user.email}</p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        {staff ? <Link className="underline" href="/app/dashboard">Coach workspace</Link> : null}
        {athlete ? <Link className="underline" href="/athlete">Athlete view</Link> : null}
        <Link className="underline" href="/forgot-password">Change password</Link>
      </div>

      <Card className="mt-8">
        <h2 className="font-semibold text-danger">Delete my account</h2>
        <p className="mt-2 text-sm">This permanently deletes:</p>
        <ul className="mt-1 list-disc pl-5 text-sm">
          <li>your sign-in details;</li>
          {personal.length ? <li>your personal training workspace, with every recording, note, goal and review in it;</li> : null}
          <li>your access to every team you belong to.</li>
        </ul>
        <p className="mt-2 text-sm text-muted">
          Teams you coached keep the recordings and reviews they own; your name is removed from them. Hosting-provider
          backups may keep copies for their backup window.
        </p>
        {soleTeamOwner.length ? (
          <p className="mt-2 text-sm">
            If you are the only owner of {soleTeamOwner.map((m) => m.org_name).join(", ")}, delete that organisation in its
            settings first, so its athletes&apos; data is not left without an owner.
          </p>
        ) : null}
        <div className="mt-4">
          <ActionForm action={deleteAccount} submitLabel="Delete my account" pendingLabel="Deleting…" submitVariant="danger">
            <label className="label" htmlFor="confirm">Type your email address to confirm</label>
            <input className="field" id="confirm" name="confirm" type="email" autoComplete="off" placeholder={user.email ?? ""} />
          </ActionForm>
        </div>
      </Card>
    </main>
  );
}
