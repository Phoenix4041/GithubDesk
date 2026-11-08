import { Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { TextField } from "@/shared/ui/text-field";
import { useSettingsStore } from "../store";
import {
  MAX_CUSTOM_THEMES,
  MAX_THEME_FILE_BYTES,
  THEME_TOKENS,
  ThemeImportError,
  contrastWarnings,
  normalizeColor,
  parseVsCodeTheme,
  themeVariables,
} from "../theme-model";
import type { CustomTheme, ThemeBase, ThemeColors, ThemeToken } from "../theme-model";

interface ThemeEditorDialogProps {
  theme: CustomTheme | null;
  onClose: () => void;
}

export function tokenLabel(t: TFunction, token: ThemeToken): string {
  switch (token) {
    case "canvas":
      return t("settings.themes.tokens.canvas");
    case "surface":
      return t("settings.themes.tokens.surface");
    case "subtle":
      return t("settings.themes.tokens.subtle");
    case "line":
      return t("settings.themes.tokens.line");
    case "fg":
      return t("settings.themes.tokens.fg");
    case "muted":
      return t("settings.themes.tokens.muted");
    case "accent":
      return t("settings.themes.tokens.accent");
    case "accent-hover":
      return t("settings.themes.tokens.accentHover");
    case "accent-fg":
      return t("settings.themes.tokens.accentFg");
    case "accent-soft":
      return t("settings.themes.tokens.accentSoft");
    case "danger":
      return t("settings.themes.tokens.danger");
    case "success":
      return t("settings.themes.tokens.success");
    case "warning":
      return t("settings.themes.tokens.warning");
  }
}

function importErrorText(t: TFunction, error: unknown): string {
  if (error instanceof ThemeImportError) {
    switch (error.reason) {
      case "tooLarge":
        return t("settings.themes.import.tooLarge");
      case "noColors":
        return t("settings.themes.import.noColors");
      case "invalid":
        return t("settings.themes.import.invalid");
    }
  }
  return t("settings.themes.import.invalid");
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file);
  });
}

function toText(colors: ThemeColors): Partial<Record<ThemeToken, string>> {
  return { ...colors };
}

export function ThemeEditorDialog({ theme, onClose }: ThemeEditorDialogProps) {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const themes = useSettingsStore((state) => state.customThemes);
  const saveCustomTheme = useSettingsStore((state) => state.saveCustomTheme);
  const setActiveTheme = useSettingsStore((state) => state.setActiveTheme);

  const [name, setName] = useState(theme?.name ?? "");
  const [base, setBase] = useState<ThemeBase>(theme?.base ?? "dark");
  const [fields, setFields] = useState<Partial<Record<ThemeToken, string>>>(toText(theme?.colors ?? {}));
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const colors: ThemeColors = {};
  const invalid: ThemeToken[] = [];
  for (const token of THEME_TOKENS) {
    const raw = fields[token]?.trim() ?? "";
    if (raw.length === 0) {
      continue;
    }
    const color = normalizeColor(raw);
    if (color) {
      colors[token] = color;
    } else {
      invalid.push(token);
    }
  }
  const warnings = contrastWarnings(colors);
  const full = theme === null && themes.length >= MAX_CUSTOM_THEMES;
  const canSave = name.trim().length > 0 && invalid.length === 0 && Object.keys(colors).length > 0 && !full;
  const previewStyle = Object.fromEntries(themeVariables(colors)) as CSSProperties;

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      if (file.size > MAX_THEME_FILE_BYTES) {
        throw new ThemeImportError("tooLarge");
      }
      const imported = parseVsCodeTheme(await readFile(file), file.name.replace(/\.json$/i, ""));
      setName(imported.name);
      setBase(imported.base);
      setFields(toText(imported.colors));
      setImportMessage({
        ok: true,
        text: t("settings.themes.import.done", { count: Object.keys(imported.colors).length }),
      });
    } catch (error) {
      setImportMessage({ ok: false, text: importErrorText(t, error) });
    }
  }

  function save() {
    if (!canSave) {
      return;
    }
    const id = theme?.id ?? crypto.randomUUID();
    saveCustomTheme({ id, name, base, colors });
    setActiveTheme(id);
    onClose();
  }

  return (
    <Dialog
      open
      title={theme ? t("settings.themes.editTitle") : t("settings.themes.newTitle")}
      onClose={onClose}
      width="lg"
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!canSave} onClick={save}>
            {t("settings.themes.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <TextField label={t("settings.themes.name")} value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium">
            {t("settings.themes.base")}
            <select
              value={base}
              onChange={(event) => setBase(event.target.value === "light" ? "light" : "dark")}
              className="h-8 cursor-pointer rounded-md border border-line bg-surface px-2 text-[13px] text-fg focus-visible:border-accent focus-visible:outline-none"
            >
              <option value="light">{t("settings.theme.light")}</option>
              <option value="dark">{t("settings.theme.dark")}</option>
            </select>
          </label>
          <input
            ref={fileInput}
            id={fileInputId}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label={t("settings.themes.import.file")}
            onChange={(event) => void importFile(event)}
          />
          <Button icon={<Upload className="size-3.5" />} onClick={() => fileInput.current?.click()}>
            {t("settings.themes.import.action")}
          </Button>
        </div>
        {importMessage ? (
          <p className={cn("text-xs", importMessage.ok ? "text-muted" : "text-danger")} role="status">
            {importMessage.text}
          </p>
        ) : null}
        {full ? (
          <p className="text-xs text-danger" role="status">
            {t("settings.themes.full", { count: MAX_CUSTOM_THEMES })}
          </p>
        ) : null}
        <div className="grid grid-cols-[1fr_220px] gap-4">
          <div className="grid grid-cols-2 gap-2">
            {THEME_TOKENS.map((token) => {
              const bad = invalid.includes(token);
              return (
                <label key={token} className="flex flex-col gap-1 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded-sm border border-line" style={{ background: colors[token] ?? "transparent" }} aria-hidden />
                    {tokenLabel(t, token)}
                  </span>
                  <input
                    type="text"
                    value={fields[token] ?? ""}
                    placeholder="#rrggbb"
                    aria-invalid={bad || undefined}
                    spellCheck={false}
                    onChange={(event) => setFields({ ...fields, [token]: event.target.value })}
                    className={cn(
                      "h-7 rounded-md border bg-surface px-2 font-mono text-xs text-fg focus-visible:outline-none",
                      bad ? "border-danger" : "border-line focus-visible:border-accent",
                    )}
                  />
                </label>
              );
            })}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium">{t("settings.themes.preview")}</span>
            <div
              data-testid="theme-preview"
              style={previewStyle}
              className="flex flex-col gap-2 rounded-lg border border-line bg-canvas p-3 text-fg"
            >
              <div className="flex flex-col gap-1 rounded-md border border-line bg-surface p-2">
                <span className="text-[13px] font-medium">{t("settings.themes.sample.title")}</span>
                <span className="text-xs text-muted">{t("settings.themes.sample.muted")}</span>
                <span className="rounded bg-subtle px-1.5 py-0.5 text-xs">{t("settings.themes.sample.subtle")}</span>
                <span className="text-xs text-danger">{t("settings.themes.sample.error")}</span>
              </div>
              <span className="w-fit rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg">
                {t("settings.themes.sample.button")}
              </span>
            </div>
            {invalid.length > 0 ? (
              <p className="text-xs text-danger" role="alert">
                {t("settings.themes.invalid")}
              </p>
            ) : null}
            {warnings.length > 0 ? (
              <ul className="flex flex-col gap-0.5 text-xs text-warning" aria-label={t("settings.themes.lowContrast")}>
                {warnings.map((warning) => (
                  <li key={`${warning.foreground}-${warning.background}`}>
                    {t("settings.themes.contrastPair", {
                      foreground: tokenLabel(t, warning.foreground),
                      background: tokenLabel(t, warning.background),
                      ratio: warning.ratio,
                    })}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
