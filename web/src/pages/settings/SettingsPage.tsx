import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { useUserAccess } from "@/access/UserAccessContext";
import { LanguageSelector } from "@/components/LanguageSelector";
import { UnitsSelector } from "@/components/UnitsSelector";
import { useNotifications } from "@/notifications/NotificationContext";
import { useUserSession } from "@/user/UserSessionContext";
import { resetLocalData, type ResetableKey } from "@/preferences/resetLocalData";

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { plan } = useUserAccess();
  const { notify } = useNotifications();
  const { session } = useUserSession();

  const [selectedKeys, setSelectedKeys] = useState<ResetableKey[]>([]);

  const toggleKey = (key: ResetableKey) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleReset = () => {
    if (selectedKeys.length === 0) return;
    if (!window.confirm(t("settings.reset.confirm"))) return;
    resetLocalData(selectedKeys);
    setSelectedKeys([]);
    notify("success", t("settings.reset.done"));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("settings.subtitle")}
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">
          {t("settings.section.general")}
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <LanguageSelector />
          <UnitsSelector />
        </div>
        <div className="text-xs text-slate-500">
          {t("settings.plan.label", { plan })}
        </div>
        {session && (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
            <span>
              {t("settings.userId.label")}: {session.userId}
            </span>
            <button
              type="button"
              className="underline hover:text-slate-700"
              onClick={async () => {
                try {
                  if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(session.userId);
                    notify("success", t("settings.userId.copied"));
                  }
                } catch {
                  notify("error", t("settings.userId.copyError"));
                }
              }}
            >
              {t("settings.userId.copy")}
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">
          {t("settings.section.data")}
        </h2>
        <p className="text-xs text-slate-500">
          {t("settings.reset.description")}
        </p>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedKeys.includes("quickRounds")}
              onChange={() => toggleKey("quickRounds")}
            />
            {t("settings.reset.quickRounds")}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedKeys.includes("bag")}
              onChange={() => toggleKey("bag")}
            />
            {t("settings.reset.bag")}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedKeys.includes("rangeSessions")}
              onChange={() => toggleKey("rangeSessions")}
            />
            {t("settings.reset.rangeSessions")}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedKeys.includes("calibration")}
              onChange={() => toggleKey("calibration")}
            />
            {t("settings.reset.calibration")}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedKeys.includes("preferences")}
              onChange={() => toggleKey("preferences")}
            />
            {t("settings.reset.preferences")}
          </label>
        </div>
        <button
          type="button"
          className="mt-3 inline-flex items-center rounded-md border border-rose-500 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
          onClick={handleReset}
          disabled={selectedKeys.length === 0}
        >
          {t("settings.reset.button")}
        </button>
      </section>
    </div>
  );
};
