export type DrillType = "gym_test" | "general_movement" | "softball_hitting" | "softball_pitching" | "other";
export type Outcome = "swing_miss" | "foul" | "fair_contact" | "unclear" | "target_hit" | "target_missed";
export type EventType = "rep" | "swing" | "pitch" | "setup" | "transition" | "other";

export const DRILLS: Record<DrillType, { label: string; short: string; eventType: EventType; outcomes: Outcome[]; analysable: boolean }> = {
  gym_test: { label: "Gym test (mixed movement)", short: "Gym test", eventType: "rep", outcomes: [], analysable: true },
  general_movement: { label: "Any movement (describe it)", short: "Movement", eventType: "rep", outcomes: [], analysable: true },
  softball_hitting: { label: "Softball hitting", short: "Hitting", eventType: "swing", outcomes: ["fair_contact", "foul", "swing_miss", "unclear"], analysable: true },
  softball_pitching: { label: "Underhand softball pitching", short: "Pitching", eventType: "pitch", outcomes: ["target_hit", "target_missed", "unclear"], analysable: true },
  other: { label: "Other / manual only", short: "Other", eventType: "rep", outcomes: [], analysable: false },
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  fair_contact: "Fair contact",
  foul: "Foul",
  swing_miss: "Swing and miss",
  unclear: "Unclear",
  target_hit: "Target hit",
  target_missed: "Target missed",
};

export const EVENT_LABEL: Record<EventType, string> = {
  rep: "Rep",
  swing: "Swing",
  pitch: "Pitch",
  setup: "Setup / pickup",
  transition: "Transition",
  other: "Other",
};

export const VIDEO_STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  queued: "Queued",
  processing: "Processing",
  ready_for_review: "Ready for review",
  approved: "Approved",
  published: "Published",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const UPLOAD_STATUS_LABEL: Record<string, string> = {
  pending_upload: "Uploading",
  uploaded: "Checking file",
  probing: "Checking file",
  ready: "Ready",
  rejected: "Rejected",
};

export function isDrill(v: string): v is DrillType {
  return v in DRILLS;
}
