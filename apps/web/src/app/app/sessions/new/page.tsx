import { ActionForm } from "@/components/FormStateForm";
import { SessionFields } from "@/components/SessionFields";
import { Card, PageHeader } from "@/components/ui";
import { requireStaffContext } from "@/lib/auth";
import { listStaff } from "@/lib/staff";
import { saveSession } from "../actions";

export const metadata = { title: "New session" };

export default async function NewSession() {
  const { supabase, membership, user } = await requireStaffContext();
  const { data: teams } = await supabase.from("teams").select("id, name").eq("org_id", membership.org_id).is("archived_at", null).order("name");
  const coaches = await listStaff(supabase, membership.org_id, user.id);
  return (
    <>
      <PageHeader title="New session" />
      <Card className="max-w-2xl">
        <ActionForm action={saveSession} submitLabel="Create session">
          <SessionFields teams={teams ?? []} coaches={coaches} session={{ coach_user_id: user.id }} />
        </ActionForm>
      </Card>
    </>
  );
}
