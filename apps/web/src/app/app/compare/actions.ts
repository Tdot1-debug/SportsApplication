"use server";
import { revalidatePath } from "next/cache";
import { requireStaffContext } from "@/lib/auth";

type State = { error?: string; ok?: string } | undefined;

export async function saveComparison(_: State, f: FormData): Promise<State> {
  const { supabase, user, membership } = await requireStaffContext();
  const a = String(f.get("a")), b = String(f.get("b"));
  const [va, vb] = a < b ? [a, b] : [b, a];
  const notes = String(f.get("notes") ?? "").slice(0, 8000);
  const { data: vid } = await supabase.from("videos").select("team_id, player_id").eq("id", va).maybeSingle();
  if (!vid?.player_id) return { error: "Recording not found." };
  const { error } = await supabase.from("comparisons").upsert(
    { org_id: membership.org_id, team_id: vid.team_id, player_id: vid.player_id, video_a: va, video_b: vb, notes, created_by: user.id },
    { onConflict: "video_a,video_b" },
  );
  if (error) return { error: error.message };
  revalidatePath("/app/compare");
  return { ok: "Notes saved." };
}
