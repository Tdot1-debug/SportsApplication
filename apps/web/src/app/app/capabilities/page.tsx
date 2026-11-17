import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { KIND_LABEL, REGISTRY, REGISTRY_VERSION, STATUS_LABEL, type CapabilityStatus } from "@/lib/capabilities";

export const metadata = { title: "What Smarvii can analyse" };

const tone = (s: CapabilityStatus) => (s === "validated" ? "ok" : s === "experimental" ? "ai" : s === "unavailable" ? "danger" : "neutral");

function Cites({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <span className="text-xs text-muted">
      {" "}
      [{ids.map((id, i) => (
        <span key={id}>
          {i ? ", " : ""}
          <a className="underline" href={`#src-${id}`}>{id}</a>
        </span>
      ))}]
    </span>
  );
}

export default function Capabilities() {
  return (
    <>
      <PageHeader
        title="What Smarvii can analyse"
        subtitle={`Capability registry ${REGISTRY_VERSION}. Every analysis run records the version it used; older reports keep their original labels.`}
      />
      <div className="mb-4">
        <Notice tone="info" title="Counts and notes, not measurements">
          Automated analysis suggests events and visible observations for a person to check. Speed, force, distance, joint angles and
          injury risk are not produced from video here, and a model&apos;s estimate of a number is never shown as a measurement.
          Nothing is validated yet: validation means passing an evaluation with thresholds set in advance.
        </Notice>
      </div>
      <div className="grid gap-4">
        {REGISTRY.activities.map((a) => (
          <Card key={a.id} aria-labelledby={`cap-${a.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`cap-${a.id}`} className="text-lg font-semibold">{a.label}</h2>
              <Badge tone={tone(a.status)}>{STATUS_LABEL[a.status]}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">{a.training_question}</p>
            {a.metrics.length > 0 && (
              <>
                <h3 className="mt-3 text-sm font-semibold">What it can suggest</h3>
                <ul className="mt-1 grid gap-1 text-sm">
                  {a.metrics.map((m) => (
                    <li key={m.id}>
                      <span className="font-medium">{m.label}</span> <Badge>{KIND_LABEL[m.kind]}</Badge> <Badge tone={tone(m.status)}>{STATUS_LABEL[m.status]}</Badge>
                      <span className="text-muted"> {m.definition}</span>
                      <Cites ids={m.sources} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {a.not_available.length > 0 && (
              <>
                <h3 className="mt-3 text-sm font-semibold">Not available from video</h3>
                <ul className="mt-1 grid gap-1 text-sm">
                  {a.not_available.map((n) => (
                    <li key={n.metric}>
                      <span className="font-medium">{n.metric}.</span> <span className="text-muted">{n.reason}</span>
                      <Cites ids={n.sources} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3 className="mt-3 text-sm font-semibold">How to film it</h3>
            <p className="text-sm text-muted">
              {a.capture.view}
              {a.capture.min_fps ? ` At least ${a.capture.min_fps} fps${a.capture.min_resolution ? ` and ${a.capture.min_resolution}` : ""}.` : ""} Phone: {a.capture.phone}. Glasses: {a.capture.glasses}
            </p>
            {a.failure_cases.length > 0 && <p className="mt-2 text-sm text-muted"><span className="font-medium text-ink">Known to go wrong when:</span> {a.failure_cases.join("; ")}.</p>}
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <h2 className="text-lg font-semibold">Sources</h2>
        <ol className="mt-2 grid gap-2 text-sm">
          {REGISTRY.sources.map((s) => (
            <li key={s.id} id={`src-${s.id}`}>
              <span className="font-medium">{s.id}</span>: {s.citation}{" "}
              <a className="underline" href={s.url} rel="noreferrer noopener" target="_blank">link</a>, accessed {s.accessed}.{" "}
              <span className="text-muted">{s.finding}</span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
