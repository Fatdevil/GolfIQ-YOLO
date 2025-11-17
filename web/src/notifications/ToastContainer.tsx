import React from "react";

import { useNotifications } from "./NotificationContext";

const kindToClasses: Record<string, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-rose-200 bg-rose-50 text-rose-900",
};

export const ToastContainer: React.FC = () => {
  const { notifications, dismiss } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex flex-col items-center gap-2 sm:items-end sm:pr-4">
      {notifications.map((n) => {
        const cls = kindToClasses[n.kind] ?? kindToClasses.info;
        return (
          <div
            key={n.id}
            className={`pointer-events-auto max-w-xs rounded-lg border px-3 py-2 text-xs shadow ${cls}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>{n.message}</div>
              <button
                type="button"
                className="text-[10px] opacity-70 hover:opacity-100"
                onClick={() => dismiss(n.id)}
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
