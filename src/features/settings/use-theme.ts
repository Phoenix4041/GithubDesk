import { useEffect } from "react";
import { useSettingsStore } from "./store";
import type { ThemePreference } from "./store";
import { THEME_TOKENS, densityClass, themeVariables } from "./theme-model";
import type { CustomTheme, Density } from "./theme-model";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const DENSITY_CLASSES = ["density-compact", "density-comfortable"];

function resolveDark(preference: ThemePreference, systemDark: boolean): boolean {
  if (preference === "system") {
    return systemDark;
  }
  return preference === "dark";
}

export function applyCustomTheme(root: HTMLElement, theme: CustomTheme | null): void {
  for (const token of THEME_TOKENS) {
    root.style.removeProperty(`--${token}`);
  }
  if (!theme) {
    return;
  }
  for (const [name, value] of themeVariables(theme.colors)) {
    root.style.setProperty(name, value);
  }
}

export function applyDensity(root: HTMLElement, density: Density): void {
  root.classList.remove(...DENSITY_CLASSES);
  const name = densityClass(density);
  if (name) {
    root.classList.add(name);
  }
}

export function useTheme(): void {
  const theme = useSettingsStore((state) => state.theme);
  const density = useSettingsStore((state) => state.density);
  const custom = useSettingsStore(
    (state) => state.customThemes.find((candidate) => candidate.id === state.activeThemeId) ?? null,
  );

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const root = document.documentElement;
    const apply = () => {
      const dark = custom ? custom.base === "dark" : resolveDark(theme, media.matches);
      root.classList.toggle("dark", dark);
      applyCustomTheme(root, custom);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, custom]);

  useEffect(() => {
    applyDensity(document.documentElement, density);
  }, [density]);
}
