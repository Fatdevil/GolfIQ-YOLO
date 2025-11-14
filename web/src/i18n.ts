import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "./locales/en/common.json";

const storedLang =
  typeof window !== "undefined" ? window.localStorage.getItem("golfiq.lang") : null;
const initialLang = storedLang || "en";

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
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
