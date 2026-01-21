import type { UxPayloadV1 } from '../helpers/normalizePayload';

export function ExplainCard({ payload }: { payload: UxPayloadV1 }) {
  if (!payload.explain) {
    return null;
  }

  const explain = payload.explain as Record<string, unknown>;
  const confidence = explain.confidence as
    | { score?: number; label?: string }
    | undefined;

  return (
    <div className="card">
      <h3>Explain</h3>
      <div className="kv-grid">
        <div>
          <span className="meta-label">Version</span>
          <span className="meta-value">
            {(explain.version as string | undefined) ?? 'N/A'}
          </span>
        </div>
        <div>
          <span className="meta-label">Confidence</span>
          <span className="meta-value">
            {confidence?.score !== undefined
              ? `${confidence.score} (${confidence.label ?? 'N/A'})`
              : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}
