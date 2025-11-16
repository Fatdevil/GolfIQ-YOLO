import React, { createContext, useContext, useState } from "react";
import type { DistanceUnit } from "./units";
import { loadUnitsPreference, saveUnitsPreference } from "./units";
import i18n from "@/i18n";

type UnitsState = {
  unit: DistanceUnit;
  setUnit: (u: DistanceUnit) => void;
};

export const UnitsContext = createContext<UnitsState | undefined>(undefined);

function detectDefaultUnit(): DistanceUnit {
  const lang = i18n.language || "en";
  const navLang = typeof window !== "undefined" ? window.navigator.language : "en-US";
  const lowerNav = navLang.toLowerCase();

  if (lang.startsWith("sv")) return "metric";
  if (lowerNav.startsWith("en-us") || lowerNav.startsWith("en-gb")) {
    return "imperial";
  }
  return "metric";
}

export const UnitsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unit, setUnitInternal] = useState<DistanceUnit>(() =>
    loadUnitsPreference(detectDefaultUnit())
  );

  const setUnit = (u: DistanceUnit) => {
    setUnitInternal(u);
    saveUnitsPreference(u);
  };

  return (
    <UnitsContext.Provider value={{ unit, setUnit }}>
      {children}
    </UnitsContext.Provider>
  );
};

export function useUnits(): UnitsState {
  const ctx = useContext(UnitsContext);
  if (!ctx) {
    throw new Error("useUnits must be used within UnitsProvider");
  }
  return ctx;
}
