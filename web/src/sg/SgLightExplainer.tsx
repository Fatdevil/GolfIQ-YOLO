import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { buildSgLightExplainerCopy, type Translator } from "@shared/sgLightExplainer";
import { trackSgLightExplainerOpenedWeb, type SgLightExplainerSurface } from "./analytics";

type Props = {
  surface: SgLightExplainerSurface;
};

export function SgLightExplainer({ surface }: Props) {
  const { t } = useTranslation();
  const copy = useMemo(() => buildSgLightExplainerCopy(t as unknown as Translator), [t]);
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    trackSgLightExplainerOpenedWeb({ surface });
    setOpen(true);
  };

  const handleClose = () => setOpen(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t("sg_light.explainer.open_label", "Open SG Light explainer")}
        onClick={handleOpen}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-xs font-bold text-slate-100 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        data-testid="open-sg-light-explainer"
      >
        i
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60">
          <div className="w-[min(90vw,420px)] space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl" role="dialog" aria-label={copy.heading}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">{copy.heading}</p>
                <p className="text-xs text-slate-400">{copy.title}</p>
              </div>
              <button
                type="button"
                aria-label={t("sg_light.explainer.close_label", "Close explainer")}
                onClick={handleClose}
                className="rounded-full p-1 text-slate-300 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                data-testid="close-sg-light-explainer"
              >
                ✕
              </button>
            </div>

            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-100">
              {copy.bullets.map((bullet, idx) => (
                <li key={`${idx}-${bullet}`}>{bullet}</li>
              ))}
            </ul>

            <p className="text-sm text-slate-200">{copy.categoriesLine}</p>
            <p className="text-sm text-slate-200">{copy.confidenceLine}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
