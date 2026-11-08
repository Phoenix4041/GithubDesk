import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, changeLanguage, isLanguage } from "@/i18n";
import { cn } from "@/shared/lib/cn";
import { IS_MAC } from "@/shared/lib/platform";
import { Button } from "@/shared/ui/button";
import { BackgroundSetting } from "@/features/background/components/background-setting";
import type { IssuePrefixMode } from "@/features/changes/commit-message-model";
import { useCommandUiStore } from "@/features/commands/command-ui-store";
import { formatCombo } from "@/features/commands/shortcut-model";
import { useEditors } from "@/features/external/queries";
import { AccountsSection } from "@/features/github/components/accounts-section";
import { NotificationSetting } from "@/features/github/notifications/components/notification-setting";
import { Dialog } from "@/shared/ui/dialog";
import { TextField } from "@/shared/ui/text-field";
import { useSettingsStore } from "../store";
import type { ThemePreference } from "../store";
import type { Density } from "../theme-model";
import { ThemesSection } from "./themes-section";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}

function SegmentedControl<T extends string>({ label, value, options, onChange }: SegmentedControlProps<T>) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-xs font-medium">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="inline-flex w-fit gap-1 rounded-lg bg-subtle p-1">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-[background-color,color,box-shadow] duration-150",
                selected ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {option.icon}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { t } = useTranslation();
  const theme = useSettingsStore((state) => state.theme);
  const language = useSettingsStore((state) => state.language);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const setShortcutsOpen = useCommandUiStore((state) => state.setShortcutsOpen);
  const externalEditor = useSettingsStore((state) => state.externalEditor);
  const externalEditorCommand = useSettingsStore((state) => state.externalEditorCommand);
  const setExternalEditor = useSettingsStore((state) => state.setExternalEditor);
  const setExternalEditorCommand = useSettingsStore((state) => state.setExternalEditorCommand);
  const editors = useEditors();
  const issuePrefixMode = useSettingsStore((state) => state.issuePrefixMode);
  const setIssuePrefixMode = useSettingsStore((state) => state.setIssuePrefixMode);
  const density = useSettingsStore((state) => state.density);
  const setDensity = useSettingsStore((state) => state.setDensity);

  const densityOptions: SegmentOption<Density>[] = [
    { value: "compact", label: t("settings.density.compact") },
    { value: "normal", label: t("settings.density.normal") },
    { value: "comfortable", label: t("settings.density.comfortable") },
  ];

  const issuePrefixOptions: SegmentOption<IssuePrefixMode>[] = [
    { value: "off", label: t("settings.issuePrefix.off") },
    { value: "title", label: t("settings.issuePrefix.title") },
    { value: "refs", label: t("settings.issuePrefix.refs") },
  ];

  const themeOptions: SegmentOption<ThemePreference>[] = [
    { value: "system", label: t("settings.theme.system"), icon: <Monitor className="size-3.5" /> },
    { value: "light", label: t("settings.theme.light"), icon: <Sun className="size-3.5" /> },
    { value: "dark", label: t("settings.theme.dark"), icon: <Moon className="size-3.5" /> },
  ];

  const languageOptions = SUPPORTED_LANGUAGES.map((code) => ({ value: code, label: t(`settings.languages.${code}`) }));

  return (
    <Dialog
      open={open}
      title={t("settings.title")}
      onClose={onClose}
      width="md"
      footer={
        <Button variant="primary" onClick={onClose}>
          {t("common.done")}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <SegmentedControl label={t("settings.theme.label")} value={theme} options={themeOptions} onChange={setTheme} />
        <SegmentedControl label={t("settings.density.label")} value={density} options={densityOptions} onChange={setDensity} />
        <ThemesSection />
        <SegmentedControl
          label={t("settings.languageLabel")}
          value={language}
          options={languageOptions}
          onChange={(value) => {
            if (isLanguage(value)) {
              setLanguage(value);
              void changeLanguage(value);
            }
          }}
        />
        <div className="flex flex-col gap-1">
          <SegmentedControl
            label={t("settings.issuePrefix.label")}
            value={issuePrefixMode}
            options={issuePrefixOptions}
            onChange={setIssuePrefixMode}
          />
          <p className="text-xs text-muted">{t("settings.issuePrefix.hint")}</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium">{t("settings.shortcuts.label")}</span>
          <p className="text-xs text-muted">
            {t("settings.shortcuts.description", { shortcut: formatCombo("Mod+K", IS_MAC) })}
          </p>
          <Button
            className="w-fit"
            onClick={() => {
              onClose();
              setShortcutsOpen(true);
            }}
          >
            {t("settings.shortcuts.open")}
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="external-editor" className="text-xs font-medium">
            {t("settings.editor.label")}
          </label>
          <select
            id="external-editor"
            value={externalEditor ?? ""}
            onChange={(event) => setExternalEditor(event.target.value === "" ? null : event.target.value)}
            className="h-8 w-fit min-w-56 cursor-pointer rounded-md border border-line bg-surface px-2 text-[13px] text-fg focus-visible:border-accent focus-visible:outline-none"
          >
            <option value="">{t("settings.editor.auto")}</option>
            {(editors.data ?? []).map((editor) => (
              <option key={editor.id} value={editor.id}>
                {editor.label}
              </option>
            ))}
            <option value="custom">{t("settings.editor.custom")}</option>
          </select>
          {externalEditor === "custom" ? (
            <TextField
              label={t("settings.editor.command")}
              value={externalEditorCommand}
              onChange={(event) => setExternalEditorCommand(event.target.value)}
              hint={t("settings.editor.commandHint")}
              spellCheck={false}
            />
          ) : editors.data && editors.data.length === 0 ? (
            <p className="text-xs text-muted">{t("settings.editor.none")}</p>
          ) : null}
        </div>
        <AccountsSection />
        <NotificationSetting />
        <BackgroundSetting />
      </div>
    </Dialog>
  );
}
