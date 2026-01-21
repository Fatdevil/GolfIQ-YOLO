import type { UxPayloadV1 } from '../helpers/normalizePayload';

const stateColors: Record<string, string> = {
  READY: 'pill-ready',
  WARN: 'pill-warn',
  BLOCK: 'pill-block',
};

export function SummaryHeader({ payload }: { payload: UxPayloadV1 }) {
  const state = payload.state?.toUpperCase() ?? 'UNKNOWN';
  const mode = payload.mode ?? 'unknown';
  const confidenceScore = payload.confidence?.score;
  const confidenceLabel = payload.confidence?.label;

  return (
    <div className="summary-header">
      <div>
        <h1>GolfIQ UX Preview</h1>
        <p className="subtitle">Unified ux_payload_v1 renderer</p>
      </div>
      <div className="summary-meta">
        <span className={`pill ${stateColors[state] ?? 'pill-unknown'}`}>
          {state}
        </span>
        <div className="meta-block">
          <span className="meta-label">Mode</span>
          <span className="meta-value">{mode}</span>
        </div>
        <div className="meta-block">
          <span className="meta-label">Confidence</span>
          <span className="meta-value">
            {confidenceScore !== undefined
              ? `${confidenceScore} (${confidenceLabel ?? 'N/A'})`
              : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}
