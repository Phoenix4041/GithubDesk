import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { useSettingsStore } from "../store";
import { MAX_CUSTOM_THEMES } from "../theme-model";
import type { CustomTheme } from "../theme-model";
import { ThemeEditorDialog } from "./theme-editor-dialog";

type Editing = { theme: CustomTheme | null } | null;

export function ThemesSection() {
  const { t } = useTranslation();
  const themes = useSettingsStore((state) => state.customThemes);
  const activeThemeId = useSettingsStore((state) => state.activeThemeId);
  const setActiveTheme = useSettingsStore((state) => state.setActiveTheme);
  const deleteCustomTheme = useSettingsStore((state) => state.deleteCustomTheme);
  const [editing, setEditing] = useState<Editing>(null);

  const rowClasses = "flex items-center gap-2 rounded-md px-2 py-1 text-xs";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium">{t("settings.themes.label")}</span>
      <p className="text-xs text-muted">{t("settings.themes.hint", { count: MAX_CUSTOM_THEMES })}</p>
      <div role="radiogroup" aria-label={t("settings.themes.label")} className="flex flex-col gap-0.5">
        <label className={cn(rowClasses, "cursor-pointer hover:bg-subtle")}>
          <input
            type="radio"
            name="custom-theme"
            checked={activeThemeId === null}
            onChange={() => setActiveTheme(null)}
            className="accent-accent"
          />
          {t("settings.themes.none")}
        </label>
        {themes.map((theme) => (
          <div key={theme.id} className={cn(rowClasses, "hover:bg-subtle")}>
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="custom-theme"
                checked={activeThemeId === theme.id}
                onChange={() => setActiveTheme(theme.id)}
                className="accent-accent"
              />
              <span className="flex gap-0.5" aria-hidden>
                {[theme.colors.canvas, theme.colors.fg, theme.colors.accent].map((color, index) => (
                  <span key={index} className="size-3 rounded-sm border border-line" style={{ background: color ?? "transparent" }} />
                ))}
              </span>
              <span className="truncate">{theme.name}</span>
            </label>
            <Button
              size="sm"
              variant="ghost"
              icon={<Pencil className="size-3.5" />}
              aria-label={t("settings.themes.edit", { name: theme.name })}
              onClick={() => setEditing({ theme })}
            />
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-3.5" />}
              aria-label={t("settings.themes.delete", { name: theme.name })}
              onClick={() => deleteCustomTheme(theme.id)}
            />
          </div>
        ))}
      </div>
      <Button
        className="w-fit"
        icon={<Plus className="size-3.5" />}
        disabled={themes.length >= MAX_CUSTOM_THEMES}
        onClick={() => setEditing({ theme: null })}
      >
        {t("settings.themes.new")}
      </Button>
      {editing ? <ThemeEditorDialog theme={editing.theme} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
