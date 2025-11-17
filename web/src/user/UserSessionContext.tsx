import React, { createContext, useContext, useState, useEffect } from "react";
import { setCurrentUserId } from "@/user/currentUserId";
import type { UserSession } from "./sessionStorage";
import { loadUserSession, createNewUserSession } from "./sessionStorage";

type UserSessionContextValue = {
  session: UserSession | null;
  loading: boolean;
};

const UserSessionContext = createContext<UserSessionContextValue | undefined>(
  undefined
);

export const UserSessionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const existing = loadUserSession();
      const nextSession = existing ?? createNewUserSession();
      setSession(nextSession);
      setCurrentUserId(nextSession.userId);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <UserSessionContext.Provider value={{ session, loading }}>
      {children}
    </UserSessionContext.Provider>
  );
};

export function useUserSession(): UserSessionContextValue {
  const ctx = useContext(UserSessionContext);
  if (!ctx) {
    throw new Error("useUserSession must be used within UserSessionProvider");
  }
  return ctx;
}
