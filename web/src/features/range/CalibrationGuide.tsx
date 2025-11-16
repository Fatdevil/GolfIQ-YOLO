import React from "react";
import { useTranslation } from "react-i18next";

type Props = {
  onClose: () => void;
};

export const CalibrationGuide: React.FC<Props> = ({ onClose }) => {
  const { t } = useTranslation();

  return (
    <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{t("range.calibration.guide.title")}</div>
          <p className="mt-1 text-xs text-sky-800">
            {t("range.calibration.guide.subtitle")}
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>{t("range.calibration.guide.step1")}</li>
            <li>{t("range.calibration.guide.step2")}</li>
            <li>{t("range.calibration.guide.step3")}</li>
            <li>{t("range.calibration.guide.step4")}</li>
          </ol>
        </div>
        <button
          type="button"
          className="text-xs text-sky-800 hover:text-sky-900"
          onClick={onClose}
        >
          {t("range.calibration.guide.close")}
        </button>
      </div>
    </div>
  );
};
