import type { UxPayloadV1 } from '../helpers/normalizePayload';
import { safeGet } from '../helpers/safeGet';

type HudCardProps = {
  payload: UxPayloadV1;
};

export function HudCard({ payload }: HudCardProps) {
  if (!payload.hud) {
    return null;
  }

  const hud = payload.hud as Record<string, unknown>;
  const state = safeGet(hud.state as string | undefined, 'unknown');
  const score = hud.score_0_100 as number | undefined;

  return (
    <div className="card">
      <h3>HUD</h3>
      <div className="kv-grid">
        <div>
          <span className="meta-label">State</span>
          <span className="meta-value">{state}</span>
        </div>
        <div>
          <span className="meta-label">Score</span>
          <span className="meta-value">
            {score !== undefined ? score : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}
