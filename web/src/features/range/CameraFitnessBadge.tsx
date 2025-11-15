import clsx from "clsx";
import React from "react";
import { useTranslation } from "react-i18next";

import type { CameraFitness } from "@/features/range/api";

const levelToClasses: Record<CameraFitness["level"], string> = {
  good: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  bad: "bg-rose-50 text-rose-700 border-rose-200",
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

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
        levelToClasses[quality.level],
        className,
      )}
    >
      <span>{t(labelKey)}</span>
      {percentage ? <span>{percentage}</span> : null}
    </div>
  );
};
