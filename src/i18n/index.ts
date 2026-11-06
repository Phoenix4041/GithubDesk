import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";

export const SUPPORTED_LANGUAGES = ["es", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export function isLanguage(value: string): value is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function initI18n(language: Language): Promise<unknown> {
  return i18next.use(initReactI18next).init({
    lng: language,
    fallbackLng: "es",
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export function changeLanguage(language: Language): Promise<unknown> {
  return i18next.changeLanguage(language);
}

export function translateIfPresent(key: string, fallback: string): string {
  return i18next.t(key, fallback);
}

export { i18next };
