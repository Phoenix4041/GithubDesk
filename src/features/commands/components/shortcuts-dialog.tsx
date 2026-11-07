import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/cn";
import { IS_MAC } from "@/shared/lib/platform";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { SearchInput } from "@/shared/ui/search-input";
import { showToast } from "@/shared/ui/toast-store";
import { COMMAND_GROUP_ORDER, rankItems } from "../command-model";
import type { AppCommand } from "../command-model";
import { flattenCommands, useCommandRegistry } from "../command-registry";
import { useCommandUiStore } from "../command-ui-store";
import {
  assignShortcut,
  clearShortcut,
  effectiveShortcut,
  eventToCombo,
  formatCombo,
  isValidCombo,
  resetShortcut,
} from "../shortcut-model";

interface ShortcutRow {
  command: AppCommand;
  title: string;
  keywords: string;
}

function ShortcutsBody() {
  const { t } = useTranslation();
  const setOpen = useCommandUiStore((state) => state.setShortcutsOpen);
  const setRecording = useCommandUiStore((state) => state.setRecording);
  const sources = useCommandRegistry((state) => state.sources);
  const overrides = useSettingsStore((state) => state.shortcuts);
  const setShortcuts = useSettingsStore((state) => state.setShortcuts);
  const [query, setQuery] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const commands = useMemo(() => flattenCommands(sources), [sources]);

  const rows = useMemo<ShortcutRow[]>(() => {
    const sorted = [...commands].sort(
      (left, right) => COMMAND_GROUP_ORDER.indexOf(left.group) - COMMAND_GROUP_ORDER.indexOf(right.group),
    );
    const all = sorted.map((command) => ({ command, title: t(command.titleKey), keywords: command.keywords ?? "" }));
    return rankItems(all, query);
  }, [commands, query, t]);

  useEffect(() => {
    setRecording(recordingId !== null);
    return () => setRecording(false);
  }, [recordingId, setRecording]);

  useEffect(() => {
    if (recordingId === null) {
      return undefined;
    }
    const targetId = recordingId;
    function handleKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        setRecordingId(null);
        setHint(null);
        return;
      }
      const combo = eventToCombo(event, IS_MAC);
      if (!combo) {
        return;
      }
      if (!isValidCombo(combo)) {
        setHint(
          t("commands.shortcuts.invalid", {
            modifier: IS_MAC ? "Cmd" : "Ctrl",
            alt: IS_MAC ? "Option" : "Alt",
          }),
        );
        return;
      }
      const result = assignShortcut(commands, useSettingsStore.getState().shortcuts, targetId, combo);
      setShortcuts(result.overrides);
      setRecordingId(null);
      setHint(null);
      if (result.displaced.length > 0) {
        const names = result.displaced
          .map((id) => commands.find((command) => command.id === id))
          .filter((command): command is AppCommand => command !== undefined)
          .map((command) => t(command.titleKey));
        showToast({ kind: "info", title: t("commands.shortcuts.reassigned", { names: names.join(", ") }) });
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [recordingId, commands, setShortcuts, t]);

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <Dialog
      open
      title={t("commands.shortcuts.title")}
      description={t("commands.shortcuts.description")}
      onClose={() => setOpen(false)}
      width="lg"
      footer={
        <>
          <Button onClick={() => setShortcuts({})} disabled={!hasOverrides}>
            {t("commands.shortcuts.resetAll")}
          </Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            {t("common.done")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <SearchInput data-autofocus label={t("commands.shortcuts.search")} value={query} onValueChange={setQuery} />
        {hint ? (
          <p role="alert" className="text-xs text-warning">
            {hint}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">{t("commands.palette.empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {rows.map(({ command, title }) => {
              const combo = effectiveShortcut(command, overrides);
              const recording = recordingId === command.id;
              const customized = overrides[command.id] !== undefined;
              return (
                <li key={command.id} className="flex items-center gap-2 border-b border-line py-1.5 last:border-b-0">
                  <span className="min-w-0 flex-1 truncate text-[13px]">{title}</span>
                  <button
                    type="button"
                    aria-label={t("commands.shortcuts.record", { command: title })}
                    onClick={() => {
                      setHint(null);
                      setRecordingId(recording ? null : command.id);
                    }}
                    className={cn(
                      "h-7 min-w-[120px] cursor-pointer rounded-md border px-2 text-center font-mono text-[11px] transition-colors duration-150",
                      recording
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-canvas text-muted hover:border-muted/60 hover:text-fg",
                    )}
                  >
                    {recording
                      ? t("commands.shortcuts.pressKeys")
                      : combo
                        ? formatCombo(combo, IS_MAC)
                        : t("commands.shortcuts.none")}
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!customized}
                    aria-label={t("commands.shortcuts.reset", { command: title })}
                    onClick={() => setShortcuts(resetShortcut(overrides, command.id))}
                  >
                    {t("commands.shortcuts.restore")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={combo === null}
                    aria-label={t("commands.shortcuts.clear", { command: title })}
                    onClick={() => setShortcuts(clearShortcut(overrides, command.id))}
                  >
                    {t("commands.shortcuts.remove")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

export function ShortcutsDialog() {
  const open = useCommandUiStore((state) => state.shortcutsOpen);
  return open ? <ShortcutsBody /> : null;
}
