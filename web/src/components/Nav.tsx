import { NavLink } from "react-router-dom";
import { Menu } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useCalibration } from "../hooks/useCalibration";
import { qaReplayEnabled } from "../config";
import QueueIndicator from "./QueueIndicator";
import { LanguageSelector } from "./LanguageSelector";
import { UnitsSelector } from "./UnitsSelector";

export default function Nav() {
  const [open, setOpen] = useState(false);
  const { calibration } = useCalibration();
  const { t } = useTranslation();

  const links = getLinks(t);

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <NavLink to="/" className="text-lg font-semibold text-emerald-300">
            {t("app.title")}
          </NavLink>
          {calibration && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
              Calibrated ✓
            </span>
          )}
        </div>
        <nav className="hidden gap-6 text-sm font-medium text-slate-300 sm:flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `transition-colors hover:text-emerald-300 ${
                  isActive ? "text-emerald-300" : "text-slate-300"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-slate-300">
          <div className="hidden sm:flex sm:items-center sm:gap-3">
            <LanguageSelector />
            <UnitsSelector />
          </div>
          <QueueIndicator />
          <button
            onClick={() => setOpen((v) => !v)}
            className="sm:hidden"
            aria-label="Toggle navigation"
          >
            <Menu className="h-6 w-6 text-slate-300" />
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-slate-800 bg-slate-900/95 px-4 py-3 sm:hidden">
          <div className="mb-3 sm:hidden">
            <QueueIndicator />
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-3 sm:hidden">
            <LanguageSelector />
            <UnitsSelector />
          </div>
          {calibration && (
            <div className="mb-3 rounded bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
              Calibrated ✓
            </div>
          )}
          <nav className="flex flex-col gap-3 text-sm font-medium text-slate-300">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `rounded px-2 py-1 transition-colors hover:bg-slate-800 hover:text-emerald-300 ${
                    isActive ? "bg-slate-800 text-emerald-300" : "text-slate-300"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

type LinkItem = { to: string; label: string };

function getLinks(t: (key: string) => string): LinkItem[] {
  const base: LinkItem[] = [
    { to: "/", label: t("home.nav.home") },
    { to: "/play", label: t("nav.playRound") },
    { to: "/trip/start", label: t("nav.trip") },
    { to: "/analyze", label: "Analyze" },
    { to: "/calibration", label: "Calibration" },
    { to: "/mock", label: "Mock" },
    { to: "/range/practice", label: t("nav.rangePractice") },
    { to: "/profile", label: t("nav.profile") },
    { to: "/bag", label: t("nav.myBag") },
    { to: "/runs", label: "Runs" },
    { to: "/reels", label: "Reels" },
    { to: "/field-runs", label: "Field runs" },
    { to: "/accuracy", label: "Accuracy" },
    { to: "/device-dashboard", label: "Devices" },
    { to: "/admin/feedback", label: "Feedback" },
  ];
  if (qaReplayEnabled) {
    base.splice(base.length - 1, 0, { to: "/qa/replay", label: "Replay QA" });
  }
  return base;
}
