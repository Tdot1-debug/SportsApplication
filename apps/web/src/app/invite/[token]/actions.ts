"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ORG_COOKIE, requireUser } from "@/lib/auth";

export async function acceptInvite(token: string, role: string): Promise<{ error?: string } | undefined> {
  const { supabase } = await requireUser(`/invite/${token}`);
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { error: error.message };
  if (role === "coach") {
    (await cookies()).set(ORG_COOKIE, data as string, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    redirect("/app/dashboard");
  }
  redirect("/athlete");
}
