import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Issues a short-lived signed playback URL. Access is checked twice: the videos RLS policy
// (row must be visible to this user) and the storage SELECT policy evaluated when signing.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: video } = await supabase.from("videos").select("id, storage_path, preview_path, upload_status").eq("id", id).maybeSingle();
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (video.upload_status === "pending_upload") return NextResponse.json({ error: "Upload not finished" }, { status: 409 });

  const { data: cfg } = await supabase.from("app_config").select("value").eq("key", "signed_url_seconds").maybeSingle();
  const ttl = Math.min(Math.max(Number(cfg?.value ?? 600), 60), 3600);
  const wantOriginal = request.nextUrl.searchParams.get("variant") === "original";
  const path = !wantOriginal && video.preview_path ? video.preview_path : video.storage_path;
  const { data, error } = await supabase.storage.from("videos").createSignedUrl(path, ttl, wantOriginal ? { download: true } : undefined);
  if (error || !data) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return NextResponse.json(
    { url: data.signedUrl, expires_in: ttl, variant: path === video.preview_path ? "preview" : "original" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
