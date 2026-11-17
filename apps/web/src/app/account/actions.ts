"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ORG_COOKIE, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type State = { error?: string; ok?: string } | undefined;

/**
 * Deletes the signed-in user's account. Step 1 runs as the user (RLS-checked RPC): it deletes their personal
 * workspaces, revokes memberships and refuses while they are the only owner of a team organisation.
 * Step 2 deletes the auth user with the service-role key, only for the id the session itself belongs to.
 */
export async function deleteAccount(_: State, f: FormData): Promise<State> {
  const { supabase, user } = await requireUser("/account");
  const { error } = await supabase.rpc("delete_my_account", { p_confirm_email: String(f.get("confirm") ?? "") });
  if (error) return { error: error.message };
  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.deleteUser(user.id);
  if (authError) {
    return { error: "Your data was removed, but signing-in details could not be deleted. Please try again or contact support." };
  }
  await supabase.auth.signOut();
  (await cookies()).delete(ORG_COOKIE);
  redirect("/?account_deleted=1");
}
