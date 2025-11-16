import clsx from "clsx";
import React from "react";
import { useTranslation } from "react-i18next";

import type { CameraFitness } from "@/features/range/api";

const levelToClasses: Record<CameraFitness["level"], string> = {
  good: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  bad: "bg-rose-50 text-rose-700 border-rose-200",
};

const reasonToKey: Record<string, string> = {
  fps_low: "range.camera.reason.fps_low",
  blur_high: "range.camera.reason.blur_high",
  mpx_low: "range.camera.reason.mpx_low",
  light_low: "range.camera.reason.light_low",
};

export type CameraFitnessBadgeProps = {
  quality: CameraFitness;
  className?: string;
};

export const CameraFitnessBadge: React.FC<CameraFitnessBadgeProps> = ({
  quality,
  className,
}) => {
  const { t } = useTranslation();
  const cls = levelToClasses[quality.level];
  const labelKey =
    quality.level === "good"
      ? "range.camera.good"
      : quality.level === "warning"
        ? "range.camera.warning"
        : "range.camera.bad";

  const percentage =
    typeof quality.score === "number"
      ? `${Math.round(Math.min(Math.max(quality.score, 0), 1) * 100)}%`
      : null;
  const reasons = (quality.reasons ?? []).slice(0, 2);

  return (
    <div className={clsx("inline-flex flex-col gap-1", className)}>
      <div
        className={clsx(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
          cls,
        )}
      >
        <span>{t(labelKey)}</span>
        {percentage ? <span>{percentage}</span> : null}
      </div>
      {reasons.length > 0 && (
        <ul className="ml-1 list-disc pl-4 text-[11px] text-slate-600">
          {reasons.map((reason) => (
            <li key={reason}>{t(reasonToKey[reason] ?? "range.camera.reason.generic")}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
