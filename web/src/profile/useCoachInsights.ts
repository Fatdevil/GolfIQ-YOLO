import { useEffect, useState } from "react";

// Legacy placeholder hook kept for backward compatibility with older specs.
export interface CoachInsightsLegacy {
  loading: boolean;
  insights: any;
  error?: Error;
}

export function useCoachInsights(): CoachInsightsLegacy {
  const [state] = useState<CoachInsightsLegacy>({
    loading: false,
    insights: null,
  });

  useEffect(() => {
    // No-op legacy hook to satisfy existing mocks.
  }, []);

  return state;
}

export default useCoachInsights;
