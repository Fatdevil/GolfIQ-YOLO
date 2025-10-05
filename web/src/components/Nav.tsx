import { NavLink } from "react-router-dom";
import { Menu } from "lucide-react";
import { useState } from "react";

import { useCalibration } from "../hooks/useCalibration";

const links = [
  { to: "/", label: "Analyze" },
  { to: "/calibration", label: "Calibration" },
  { to: "/mock", label: "Mock" },
  { to: "/runs", label: "Runs" },
  { to: "/field-runs", label: "Field runs" },
  { to: "/device-dashboard", label: "Devices" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const { calibration } = useCalibration();

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <NavLink to="/" className="text-lg font-semibold text-emerald-300">
            GolfIQ
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
        <button
          onClick={() => setOpen((v) => !v)}
          className="sm:hidden"
          aria-label="Toggle navigation"
        >
          <Menu className="h-6 w-6 text-slate-300" />
        </button>
      </div>
      {open && (
        <div className="border-t border-slate-800 bg-slate-900/95 px-4 py-3 sm:hidden">
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
