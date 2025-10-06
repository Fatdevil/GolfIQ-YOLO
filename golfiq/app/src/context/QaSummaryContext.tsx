import React, { createContext, useContext, useMemo, useState } from 'react';

export type QaSummary = {
  quality?: string | null;
  metrics?: Record<string, unknown> | null;
  notes?: string | null;
  capturedAt: number;
};

type QaSummaryContextValue = {
  qaSummary: QaSummary | null;
  setQaSummary: (summary: QaSummary | null) => void;
};

const QaSummaryContext = createContext<QaSummaryContextValue | undefined>(undefined);

export function QaSummaryProvider({ children }: { children: React.ReactNode }) {
  const [qaSummary, setQaSummary] = useState<QaSummary | null>(null);

  const value = useMemo(() => ({ qaSummary, setQaSummary }), [qaSummary]);

  return <QaSummaryContext.Provider value={value}>{children}</QaSummaryContext.Provider>;
}

export function useQaSummary() {
  const ctx = useContext(QaSummaryContext);
  if (!ctx) {
    throw new Error('useQaSummary must be used within a QaSummaryProvider');
  }
  return ctx;
}
