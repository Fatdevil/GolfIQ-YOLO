export function SGDeltaBadge({ delta }: { delta: number }) {
  const sign = delta >= 0 ? '+' : '';
  const cls = delta >= 0 ? 'text-emerald-600' : 'text-rose-600';
  return (
    <span
      aria-label="Strokes Gained delta"
      className={`inline-flex items-center text-sm font-semibold ${cls}`}
    >
      {`${sign}${delta.toFixed(2)}`}
    </span>
  );
}

export default SGDeltaBadge;
