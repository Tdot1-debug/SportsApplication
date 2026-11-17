"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffContext } from "@/lib/auth";

type State = { error?: string; ok?: string } | undefined;
const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v.length ? v : null; };

export async function saveSession(_: State, f: FormData): Promise<State> {
  const { supabase, user, membership } = await requireStaffContext();
  const id = str(f, "id");
  const row = {
    team_id: str(f, "team_id")!, session_date: str(f, "session_date")!, title: str(f, "title")!,
    drill_type: (str(f, "drill_type") ?? "other") as "other", intended_target: str(f, "intended_target"), notes: str(f, "notes"),
    coach_user_id: str(f, "coach_user_id") ?? user.id,
  };
  if (!row.team_id || !row.session_date || !row.title) return { error: "Team, date and title are required." };
  if (id) {
    const { error } = await supabase.from("practice_sessions").update(row).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath(`/app/sessions/${id}`);
    return { ok: "Session saved." };
  }
  const { data, error } = await supabase.from("practice_sessions").insert({ ...row, org_id: membership.org_id, created_by: user.id }).select("id").single();
  if (error) return { error: error.message.includes("row-level") ? "You do not have access to that team." : error.message };
  redirect(`/app/sessions/${data.id}`);
}

export async function deleteSession(id: string) {
  const { supabase } = await requireStaffContext();
  const { error } = await supabase.from("practice_sessions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/sessions");
  redirect("/app/sessions");
}
