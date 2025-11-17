import React, { createContext, useCallback, useContext, useState } from "react";

export type NotificationKind = "success" | "info" | "warning" | "error";

export type Notification = {
  id: string;
  kind: NotificationKind;
  message: string;
};

type NotificationContextValue = {
  notifications: Notification[];
  notify: (kind: NotificationKind, message: string) => void;
  dismiss: (id: string) => void;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const notify = useCallback(
    (kind: NotificationKind, message: string) => {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const n: Notification = { id, kind, message };
      setNotifications((prev) => [...prev, n]);

      // Auto-dismiss after 4s
      window.setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  return (
    <NotificationContext.Provider value={{ notifications, notify, dismiss }}>
      {children}
    </NotificationContext.Provider>
  );
};

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}
