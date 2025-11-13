import clsx from 'clsx';

export function SGDeltaBadge({ delta }: { delta: number }) {
  const rounded = Number.isFinite(delta) ? Math.round(delta * 100) / 100 : 0;
  const sign = rounded >= 0 ? '+' : '';
  const display = `${sign}${rounded.toFixed(2)}`;
  const tone = rounded > 0 ? 'positive' : rounded < 0 ? 'negative' : 'neutral';

  const className = clsx(
    'inline-flex min-w-[3.25rem] items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide',
    {
      'border-emerald-700/60 bg-emerald-950/60 text-emerald-300': tone === 'positive',
      'border-rose-700/60 bg-rose-950/60 text-rose-300': tone === 'negative',
      'border-slate-700/60 bg-slate-900/80 text-slate-200': tone === 'neutral',
    },
  );

  return (
    <span aria-label="Strokes Gained delta" className={className}>
      {display}
    </span>
  );
}

export default SGDeltaBadge;
