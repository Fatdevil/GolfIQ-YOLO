import type { EventState, LeaderRow } from '../../../../../shared/event/models';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatScore(row: LeaderRow, mode: 'gross' | 'net' | 'stableford' | 'sg'): string {
  if (mode === 'gross') {
    return Number.isFinite(row.gross ?? NaN) ? String(Math.round(Number(row.gross))) : '--';
  }
  if (mode === 'net') {
    return Number.isFinite(row.net ?? NaN) ? String(Math.round(Number(row.net))) : '--';
  }
  if (mode === 'stableford') {
    return Number.isFinite(row.stableford ?? NaN) ? `${Math.round(Number(row.stableford))} pts` : '--';
  }
  return Number.isFinite(row.sg ?? NaN) ? Number(row.sg).toFixed(1) : '--';
}

function extractValue(row: LeaderRow, mode: 'gross' | 'net' | 'stableford' | 'sg'): number | null {
  if (mode === 'gross') {
    return Number.isFinite(row.gross ?? NaN) ? Number(row.gross) : null;
  }
  if (mode === 'net') {
    return Number.isFinite(row.net ?? NaN) ? Number(row.net) : null;
  }
  if (mode === 'stableford') {
    return Number.isFinite(row.stableford ?? NaN) ? Number(row.stableford) : null;
  }
  return Number.isFinite(row.sg ?? NaN) ? Number(row.sg) : null;
}

function formatDelta(
  value: number | null,
  leader: number | null,
  direction: 'asc' | 'desc',
): string {
  if (value == null || leader == null) {
    return '';
  }
  if (direction === 'asc') {
    const diff = value - leader;
    if (Math.abs(diff) < 1e-9) {
      return 'E';
    }
    const rounded = Math.round(diff);
    return rounded > 0 ? `+${rounded}` : String(rounded);
  }
  const diff = leader - value;
  if (Math.abs(diff) < 1e-9) {
    return 'E';
  }
  const rounded = Math.round(diff);
  return rounded >= 0 ? `+${rounded}` : String(rounded);
}

function formatModeLabel(mode: 'gross' | 'net' | 'stableford' | 'sg'): string {
  switch (mode) {
    case 'gross':
      return 'Gross';
    case 'net':
      return 'Net';
    case 'stableford':
      return 'Stableford';
    case 'sg':
      return 'Strokes Gained';
    default:
      return 'Leaderboard';
  }
}

export function renderEventBoardSVG(
  event: EventState,
  rows: LeaderRow[],
  mode: 'gross' | 'net' | 'stableford' | 'sg',
): string {
  const width = 1080;
  const height = 1080;
  const headerHeight = 220;
  const rowHeight = 90;
  const padding = 64;
  const visibleRows = rows.slice(0, 8);
  const direction: 'asc' | 'desc' = mode === 'stableford' || mode === 'sg' ? 'desc' : 'asc';
  const leaderValue = extractValue(visibleRows[0] ?? ({} as LeaderRow), mode);

  const body = visibleRows
    .map((row, idx) => {
      const y = headerHeight + padding + idx * rowHeight;
      const value = extractValue(row, mode);
      const delta = formatDelta(value, leaderValue, direction);
      const score = formatScore(row, mode);
      return `
        <g transform="translate(${padding}, ${y})">
          <rect x="0" y="-48" width="${width - padding * 2}" height="72" rx="18" fill="${idx % 2 === 0 ? '#141c2f' : '#10172a'}" />
          <text x="32" y="0" font-family="'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="40" fill="#8ea0c9">${row.rank}</text>
          <text x="120" y="0" font-family="'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="42" font-weight="600" fill="#ffffff">${escapeXml(row.name)}</text>
          <text x="${width - padding - 180}" y="0" font-family="'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="40" fill="#ffffff" text-anchor="end">${escapeXml(score)}</text>
          <text x="${width - padding - 40}" y="0" font-family="'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="36" fill="#8ea0c9" text-anchor="end">${escapeXml(delta)}</text>
        </g>
      `;
    })
    .join('');

  const title = escapeXml(event.name || 'Event Leaderboard');
  const subtitleParts = [formatModeLabel(mode)];
  if (event.courseId) {
    subtitleParts.push(`Course ${escapeXml(event.courseId)}`);
  }
  const subtitle = subtitleParts.join(' • ');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
      <rect width="100%" height="100%" fill="#0a0f1d" rx="48" />
      <text x="${padding}" y="${padding + 36}" font-family="'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="60" font-weight="700" fill="#ffffff">${title}</text>
      <text x="${padding}" y="${padding + 110}" font-family="'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="40" fill="#8ea0c9">${escapeXml(subtitle)}</text>
      <text x="${padding}" y="${padding + 180}" font-family="'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="32" fill="#8ea0c9">Updated ${new Date(event.createdAt).toLocaleDateString()}</text>
      ${body}
    </svg>
  `.trim();
}

