import type { CoachTip, UxPayloadV1 } from '../helpers/normalizePayload';

export function MicroCoachCard({ payload }: { payload: UxPayloadV1 }) {
  const tips = payload.coach?.tips ?? [];

  if (tips.length === 0) {
    return (
      <div className="card">
        <h3>Micro Coach</h3>
        <p className="muted">No tips in payload.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Micro Coach</h3>
      <ul className="tip-list">
        {tips.map((tip, index) => (
          <TipItem key={tip.id ?? tip.key ?? `${tip.title}-${index}`} tip={tip} />
        ))}
      </ul>
    </div>
  );
}

function TipItem({ tip }: { tip: CoachTip }) {
  return (
    <li className="tip-item">
      <div className="tip-title">{tip.title ?? 'Untitled tip'}</div>
      {tip.detail ? <div className="tip-detail">{tip.detail}</div> : null}
    </li>
  );
}
