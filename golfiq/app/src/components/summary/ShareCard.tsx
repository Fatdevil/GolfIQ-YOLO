import type { RoundSummary } from '../../../../../shared/round/summary';

export interface ShareCardMeta {
  courseId: string;
  courseName?: string | null;
  startedAt: number;
  finishedAt?: number;
  holeCount: number;
  tournamentSafe: boolean;
}

interface PhaseRow {
  label: string;
  value: number;
  color: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSigned(value: number): string {
  if (Number.isNaN(value)) {
    return '0.0';
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
}

function formatScore(toPar: number | null): string {
  if (toPar == null) {
    return '--';
  }
  if (toPar === 0) {
    return 'E';
  }
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

function formatDate(ts: number): string {
  if (!Number.isFinite(ts)) {
    return '';
  }
  const date = new Date(ts);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function render(summary: RoundSummary, meta: ShareCardMeta): string {
  const width = 1080;
  const height = 1080;
  const margin = 72;
  const baseY = 400;
  const barHeight = 64;
  const barSpacing = 30;
  const barWidth = 360;

  const phases: PhaseRow[] = [
    { label: 'OTT', value: summary.phases.ott, color: '#4da3ff' },
    { label: 'APP', value: summary.phases.app, color: '#5ad07a' },
    { label: 'ARG', value: summary.phases.arg, color: '#f9a23f' },
    { label: 'PUTT', value: summary.phases.putt, color: '#ff6b8a' },
  ];

  const maxAbs = Math.max(0.1, ...phases.map((phase) => Math.abs(phase.value)));
  const courseLabel = meta.courseName?.trim() || meta.courseId;
  const finishDate = formatDate(meta.finishedAt ?? meta.startedAt);
  const scoreLabel = formatScore(summary.toPar);

  const bars = phases
    .map((phase, index) => {
      const value = Number.isFinite(phase.value) ? phase.value : 0;
      const relative = Math.min(1, Math.abs(value) / maxAbs);
      const widthPx = Math.max(4, relative * barWidth);
      const x = width / 2 - widthPx / 2;
      const y = baseY + index * (barHeight + barSpacing);
      return `
        <g>
          <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${widthPx.toFixed(1)}" height="${barHeight}" rx="16" fill="${phase.color}" opacity="0.85" />
          <text x="${(width / 2).toFixed(1)}" y="${(y + barHeight / 2 + 12).toFixed(1)}" font-family="'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="48" font-weight="600" fill="#0a0a0a" text-anchor="middle">${phase.label} ${formatSigned(value)}</text>
        </g>
      `;
    })
    .join('');

  const footerLines = [
    `${escapeXml(courseLabel)} • ${meta.holeCount} holes`,
    finishDate ? `Played ${escapeXml(finishDate)}${meta.tournamentSafe ? ' • Tournament Safe' : ''}` : meta.tournamentSafe ? 'Tournament Safe' : '',
  ].filter((line) => line.length > 0);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
      <rect width="100%" height="100%" fill="#0b1221" rx="48" />
      <text x="${margin}" y="${margin + 48}" font-family="'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="72" font-weight="700" fill="#ffffff">GolfIQ</text>
      <text x="${margin}" y="${margin + 144}" font-family="'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="48" fill="#a6b7d6">Total SG</text>
      <text x="${margin}" y="${margin + 224}" font-family="'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="140" font-weight="700" fill="#ffffff">${formatSigned(summary.phases.total)}</text>
      <text x="${width - margin}" y="${margin + 144}" font-family="'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="48" fill="#a6b7d6" text-anchor="end">Score vs Par</text>
      <text x="${width - margin}" y="${margin + 224}" font-family="'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="120" font-weight="600" fill="#ffffff" text-anchor="end">${scoreLabel}</text>
      ${bars}
      ${footerLines
        .map(
          (line, idx) => `
        <text x="${margin}" y="${height - margin + idx * 48}" font-family="'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="42" fill="#a6b7d6">${escapeXml(line)}</text>
      `,
        )
        .join('')}
    </svg>
  `.trim();
}
