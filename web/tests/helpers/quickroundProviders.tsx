import React from "react";
import { MemoryRouter } from "react-router-dom";

import { NotificationProvider } from "@/notifications/NotificationContext";
import { UnitsProvider } from "@/preferences/UnitsContext";
import { UserAccessProvider } from "@/access/UserAccessContext";
import type { PlanName } from "@/access/types";
import { UserSessionProvider } from "@/user/UserSessionContext";

interface QuickRoundTestProvidersProps {
  children: React.ReactNode;
  initialEntries?: string[];
  withAccessProvider?: boolean;
  accessPlan?: PlanName;
}

export function QuickRoundTestProviders({
  children,
  initialEntries = ["/"],
  withAccessProvider = false,
  accessPlan = "pro",
}: QuickRoundTestProvidersProps): JSX.Element {
  const routedChildren = (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );

  const wrappedProviders = (
    <UnitsProvider>
      <UserSessionProvider>
        <NotificationProvider>{routedChildren}</NotificationProvider>
      </UserSessionProvider>
    </UnitsProvider>
  );

  if (withAccessProvider) {
    return (
      <UserAccessProvider autoFetch={false} initialPlan={accessPlan}>
        {wrappedProviders}
      </UserAccessProvider>
    );
  }

  return wrappedProviders;
}
