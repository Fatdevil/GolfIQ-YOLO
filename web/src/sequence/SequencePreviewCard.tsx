import type { KinematicSequence } from "@/types/sequence";

function formatDegrees(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) {
    return "–";
  }
  return `${value.toFixed(digits)}°`;
}

type Props = {
  sequence?: KinematicSequence | null;
};

export function SequencePreviewCard({ sequence }: Props) {
  if (!sequence) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
        No sequence data available for this swing.
      </div>
    );
  }

  const orderText = (() => {
    const order = sequence.sequenceOrder;
    const peakOrder = order?.peakOrder ?? [];
    if (!peakOrder.length) {
      return "Sequence order unavailable.";
    }
    const arrowChain = peakOrder.join(" → ");
    if (order?.isIdeal) {
      return `Your kinematic sequence is on point (${arrowChain}).`;
    }
    return `Sequence: ${arrowChain} (ideally hips should start).`;
  })();

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-100 shadow">
      <div className="text-xs uppercase tracking-wide text-emerald-300">Kinematic sequence</div>
      <div className="mt-1 text-slate-100">
        Max rotation: hips {formatDegrees(sequence.maxHipRotation)}, shoulders {formatDegrees(sequence.maxShoulderRotation)}, X-factor
        {" "}
        {formatDegrees(sequence.maxXFactor)}
      </div>
      <div className="mt-1 text-emerald-50">{orderText}</div>
    </div>
  );
}

export default SequencePreviewCard;
