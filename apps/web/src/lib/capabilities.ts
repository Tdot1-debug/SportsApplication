// Typed access to the versioned sport capability registry. Source: registry/capabilities.v1.json at the repo root,
// copied here by `node registry/sync.mjs`. A unit test fails if this copy drifts from the source.
import data from "./capabilities.v1.json";

export type CapabilityStatus = "validated" | "experimental" | "proposed" | "unavailable" | "manual";
export type MetricKind = "observable_event" | "qualitative_observation" | "measurement" | "contextual_outcome";

export type Metric = { id: string; label: string; kind: MetricKind; unit: string | null; status: CapabilityStatus; definition: string; sources: string[] };
export type Activity = {
  id: string;
  sport: string;
  label: string;
  drill_template: string | null;
  status: CapabilityStatus;
  training_question: string;
  events: { type: string; definition: string }[];
  metrics: Metric[];
  not_available: { metric: string; reason: string; sources: string[] }[];
  capture: { view: string; min_fps: number | null; min_resolution: string | null; phone: string; glasses: string };
  failure_cases: string[];
  review_controls: string[];
  report_template: string | null;
  evaluation: { dataset: string; status: string; plan: string | null };
  cost_budget: { max_usd_per_analysed_minute: number | null; basis: string };
};
export type Source = { id: string; citation: string; url: string; accessed: string; finding: string };
export type Registry = {
  registry_version: string;
  status_definitions: Record<CapabilityStatus, string>;
  metric_kinds: Record<MetricKind, string>;
  activities: Activity[];
  sources: Source[];
};

export const REGISTRY = data as Registry;
export const REGISTRY_VERSION = REGISTRY.registry_version;

export const STATUS_LABEL: Record<CapabilityStatus, string> = {
  validated: "Validated",
  experimental: "Experimental",
  proposed: "Proposed, manual review only",
  unavailable: "Not available",
  manual: "Manual review",
};

export const KIND_LABEL: Record<MetricKind, string> = {
  observable_event: "Event",
  qualitative_observation: "Observation",
  measurement: "Measurement",
  contextual_outcome: "Outcome (human-confirmed)",
};

export function activityForTemplate(template: string): Activity | undefined {
  return REGISTRY.activities.find((a) => a.drill_template === template);
}

export function sourceById(id: string): Source | undefined {
  return REGISTRY.sources.find((s) => s.id === id);
}

/** Activities to show for a set of sports. Unknown sports fall back to the general movement + manual entries. */
export function activitiesForSports(sports: string[]): Activity[] {
  const wanted = new Set(sports.length ? sports : ["strength", "softball", "tennis", "boxing", "other"]);
  return REGISTRY.activities.filter((a) => wanted.has(a.sport) || a.sport === "other");
}
