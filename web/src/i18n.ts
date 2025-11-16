import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "./locales/en/common.json";
import svCommon from "./locales/sv/common.json";

const readStoredLang = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem("golfiq.lang");
};

const detectBrowserLang = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const navigatorLanguages = window.navigator?.languages ?? [];
  const hasSwedishPreference = navigatorLanguages.some((lang) =>
    typeof lang === "string" && lang.toLowerCase().startsWith("sv"),
  );
  if (hasSwedishPreference) {
    return "sv";
  }

  const singleLanguage = window.navigator?.language;
  if (typeof singleLanguage === "string" && singleLanguage.toLowerCase().startsWith("sv")) {
    return "sv";
  }

  return null;
};

const initialLang = readStoredLang() ?? detectBrowserLang() ?? "en";

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
      },
      sv: {
        common: svCommon,
      },
    },
    lng: initialLang,
    fallbackLng: "en",
    ns: ["common"],
    defaultNS: "common",
    keySeparator: false,
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });

export default i18n;
