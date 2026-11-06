import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, changeLanguage, isLanguage } from "@/i18n";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { useSettingsStore } from "../store";
import type { ThemePreference } from "../store";

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
      width="sm"
      footer={
        <Button variant="primary" onClick={onClose}>
          {t("common.done")}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <SegmentedControl label={t("settings.theme.label")} value={theme} options={themeOptions} onChange={setTheme} />
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
      </div>
    </Dialog>
  );
}
