import type { DistanceUnit } from "@/preferences/units";

export function convertMeters(value_m: number | null | undefined, unit: DistanceUnit): number | null {
  if (value_m == null || !Number.isFinite(value_m)) return null;
  if (unit === "metric") return value_m;
  return value_m * 1.0936133;
}

export function formatDistance(
  value_m: number | null | undefined,
  unit: DistanceUnit,
  options: { withUnit?: boolean } = {}
): string {
  const converted = convertMeters(value_m, unit);
  if (converted == null) return "–";
  const rounded = Math.round(converted);
  const suffix = options.withUnit ? (unit === "metric" ? " m" : " yd") : "";
  return `${rounded}${suffix}`;
}
