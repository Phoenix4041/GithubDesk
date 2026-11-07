import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/cn";
import { IS_MAC } from "@/shared/lib/platform";
import { reportError } from "@/shared/lib/report-error";
import { COMMAND_GROUP_ORDER, rankItems } from "../command-model";
import type { AppCommand } from "../command-model";
import { flattenCommands, useCommandRegistry } from "../command-registry";
import { useCommandUiStore } from "../command-ui-store";
import { effectiveShortcut, formatCombo } from "../shortcut-model";

interface PaletteEntry {
  command: AppCommand;
  title: string;
  keywords: string;
  groupLabel: string;
  shortcut: string;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const sources = useCommandRegistry((state) => state.sources);
  const overrides = useSettingsStore((state) => state.shortcuts);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const entries = useMemo<PaletteEntry[]>(() => {
    const available = flattenCommands(sources)
      .filter((command) => command.enabled)
      .sort((left, right) => COMMAND_GROUP_ORDER.indexOf(left.group) - COMMAND_GROUP_ORDER.indexOf(right.group));
    return available.map((command) => {
      const combo = effectiveShortcut(command, overrides);
      return {
        command,
        title: t(command.titleKey),
        keywords: command.keywords ?? "",
        groupLabel: t(`commands.groups.${command.group}`),
        shortcut: combo ? formatCombo(combo, IS_MAC) : "",
      };
    });
  }, [sources, overrides, t]);

  const results = useMemo(() => rankItems(entries, query), [entries, query]);
  const clampedIndex = Math.min(activeIndex, Math.max(results.length - 1, 0));

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [clampedIndex, results]);

  function run(entry: PaletteEntry | undefined) {
    if (!entry) {
      return;
    }
    onClose();
    Promise.resolve(entry.command.run()).catch(reportError);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (results.length === 0 ? 0 : (Math.min(current, results.length - 1) + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        results.length === 0 ? 0 : (Math.min(current, results.length - 1) - 1 + results.length) % results.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[clampedIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  const activeId = results[clampedIndex] ? `${listId}-${results[clampedIndex].command.id}` : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex animate-[fade-in_150ms_ease-out] items-start justify-center bg-black/40 px-6 pt-[14vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("commands.palette.label")}
        className="flex max-h-[60vh] w-[560px] max-w-full animate-[pop-in_200ms_var(--ease-out-expo)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label={t("commands.palette.placeholder")}
            placeholder={t("commands.palette.placeholder")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="h-12 min-w-0 flex-1 bg-transparent text-[14px] text-fg placeholder:text-muted focus-visible:outline-none"
          />
        </div>
        {results.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted">{t("commands.palette.empty")}</p>
        ) : (
          <ul ref={listRef} id={listId} role="listbox" aria-label={t("commands.palette.label")} className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {results.map((entry, index) => {
              const selected = index === clampedIndex;
              return (
                <li
                  key={entry.command.id}
                  id={`${listId}-${entry.command.id}`}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => run(entry)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[13px]",
                    selected ? "bg-accent-soft text-fg" : "text-fg",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                  <span className="shrink-0 text-[11px] text-muted">{entry.groupLabel}</span>
                  {entry.shortcut ? (
                    <kbd className="shrink-0 rounded border border-line bg-canvas px-1.5 py-px font-mono text-[11px] text-muted">
                      {entry.shortcut}
                    </kbd>
                  ) : null}
                  {selected && !entry.shortcut ? <CornerDownLeft className="size-3.5 shrink-0 text-muted" /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function CommandPalette() {
  const open = useCommandUiStore((state) => state.paletteOpen);
  const hide = useCommandUiStore((state) => state.hidePalette);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return undefined;
    }
    const active = document.activeElement;
    if (!active || active === document.body) {
      previouslyFocused.current?.focus();
    }
    previouslyFocused.current = null;
    return undefined;
  }, [open]);

  if (!open) {
    return null;
  }
  return createPortal(<PaletteBody onClose={hide} />, document.body);
}
