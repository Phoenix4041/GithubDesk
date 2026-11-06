import { useEffect } from "react";
import { useSettingsStore } from "./store";
import type { ThemePreference } from "./store";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function resolveDark(preference: ThemePreference, systemDark: boolean): boolean {
  if (preference === "system") {
    return systemDark;
  }
  return preference === "dark";
}

export function useTheme(): void {
  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const apply = () => {
      document.documentElement.classList.toggle("dark", resolveDark(theme, media.matches));
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}
