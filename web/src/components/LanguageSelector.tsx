import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

const SUPPORTED_LANGS = [
  { code: "en", label: "English" },
];

export function LanguageSelector() {
  const { i18n, t } = useTranslation();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const lang = event.target.value;
    void i18n.changeLanguage(lang);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("golfiq.lang", lang);
    }
  };

  const current = i18n.resolvedLanguage ?? i18n.language ?? "en";

  return (
    <label className="flex items-center gap-2 text-sm">
      <span>{t("languageSelector.label")}</span>
      <select
        value={current}
        onChange={handleChange}
        className="border rounded px-1 py-0.5 text-sm"
      >
        {SUPPORTED_LANGS.map((lng) => (
          <option key={lng.code} value={lng.code}>
            {lng.label}
          </option>
        ))}
      </select>
    </label>
  );
}
