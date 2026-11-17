import Link from "next/link";
import { AcceptInvite } from "@/components/AcceptInvite";
import { Card, Notice, Wordmark } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { acceptInvite } from "./actions";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase, user } = await requireUser(`/invite/${token}`);
  const { data } = await supabase.rpc("get_invitation_preview", { p_token: token });
  const inv = (data as { organization_name: string | null; role: string | null; email_matches: boolean; state: string }[] | null)?.[0];
  return (
    <main id="main" className="mx-auto max-w-lg px-5 py-12">
      <Wordmark />
      <Card className="mt-8">
        {!inv || inv.state === "invalid" ? (
          <Notice tone="danger" title="Invitation not found">Check that you copied the whole link, or ask for a new invitation.</Notice>
        ) : inv.state !== "valid" ? (
          <Notice tone="warn" title={`This invitation is ${inv.state}`}>Invitations are single-use and expire after 7 days. Ask your coach or program owner for a new link.</Notice>
        ) : !inv.email_matches ? (
          <Notice tone="warn" title="Wrong account">
            This invitation was sent to a different email address than the one you are signed in with ({user.email}). Sign out and sign in (or create an account) with the invited address.
            <form action="/auth/signout" method="post" className="mt-2"><button className="underline" type="submit">Sign out</button></form>
          </Notice>
        ) : (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Join {inv.organization_name}</h1>
            <p className="text-sm text-muted">
              {inv.role === "coach"
                ? "You are invited as a coach. You will be able to upload, review and publish for the teams the owner assigns to you."
                : "You are invited as an athlete. You will see your own published reports and any recordings your coach shares with you. You will not see teammates' footage or draft reviews."}
            </p>
            <AcceptInvite accept={acceptInvite.bind(null, token, inv.role ?? "athlete")} />
          </div>
        )}
      </Card>
      <p className="mt-4 text-center text-xs text-muted"><Link className="underline" href="/privacy">Data use notice</Link></p>
    </main>
  );
}
