import React from "react";
import { useUnits } from "@/preferences/UnitsContext";
import { useTranslation } from "react-i18next";

export const UnitsSelector: React.FC = () => {
  const { unit, setUnit } = useUnits();
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-500">{t("units.label")}</span>
      <div className="inline-flex rounded-full border border-slate-300 bg-white overflow-hidden">
        <button
          type="button"
          className={`px-2 py-0.5 ${
            unit === "metric"
              ? "bg-slate-800 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
          onClick={() => setUnit("metric")}
        >
          m
        </button>
        <button
          type="button"
          className={`px-2 py-0.5 ${
            unit === "imperial"
              ? "bg-slate-800 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
          onClick={() => setUnit("imperial")}
        >
          yd
        </button>
      </div>
    </div>
  );
};
