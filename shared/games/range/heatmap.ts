import type { Heatmap, HeatmapBin, LocalPoint } from './types';

export function makeHeatmap(points: LocalPoint[], cell_m = 5): Heatmap {
  if (!points.length) return { width: 0, height: 0, bins: [] };

  const maxX = Math.max(...points.map(p => p.x), 0);
  const minY = Math.min(...points.map(p => p.y), 0);
  const maxY = Math.max(...points.map(p => p.y), 0);

  // INCLUSIVE sizes: include boundary bins hit exactly at max
  const cols = Math.max(1, Math.floor(maxX / cell_m) + 1);
  const rows = Math.max(1, Math.floor((maxY - minY) / cell_m) + 1);

  const bins: HeatmapBin[] = [];
  const grid = new Map<string, number>();

  for (const p of points) {
    const cx = Math.max(0, Math.floor(p.x / cell_m));
    const cy = Math.max(0, Math.floor((p.y - minY) / cell_m));
    const key = `${cx}:${cy}`;
    grid.set(key, (grid.get(key) ?? 0) + 1);
  }

  for (const [key, n] of grid.entries()) {
    const [cx, cy] = key.split(':').map(Number);
    // cx ∈ [0, cols-1], cy ∈ [0, rows-1] even on boundaries
    bins.push({ x: cx, y: cy, n });
  }

  return { width: cols, height: rows, bins };
}
