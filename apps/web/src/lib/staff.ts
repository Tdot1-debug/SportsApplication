import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Staff (owner/coach) of an org, labelled by display name or a neutral fallback. */
export async function listStaff(supabase: SupabaseClient<Database>, org: string, selfId: string) {
  const { data } = await supabase.from("memberships").select("user_id, display_name, role").eq("org_id", org).eq("status", "active").in("role", ["owner", "coach"]);
  return (data ?? []).map((m, i) => ({ id: m.user_id, name: m.display_name ?? (m.user_id === selfId ? "Me" : `${m.role === "owner" ? "Owner" : "Coach"} ${i + 1}`) }));
}
