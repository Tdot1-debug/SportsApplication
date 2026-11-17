import { Badge } from "@/components/ui";
import { UPLOAD_STATUS_LABEL, VIDEO_STATUS_LABEL } from "@/lib/drills";

export function VideoStatusBadge({ status, uploadStatus, personal = false }: { status: string; uploadStatus: string; personal?: boolean }) {
  if (uploadStatus !== "ready") {
    const tone = uploadStatus === "rejected" ? "danger" : "warn";
    return <Badge tone={tone}>{UPLOAD_STATUS_LABEL[uploadStatus] ?? uploadStatus}</Badge>;
  }
  const tone =
    status === "published" ? "ok" : status === "approved" ? "ok" : status === "failed" ? "danger" : status === "ready_for_review" ? "lime" : status === "queued" || status === "processing" ? "warn" : "neutral";
  // In a personal workspace nothing is "published" to anyone; a finished review is saved to the history.
  const label = personal && status === "published" ? "Saved" : VIDEO_STATUS_LABEL[status] ?? status;
  return <Badge tone={tone}>{label}</Badge>;
}
