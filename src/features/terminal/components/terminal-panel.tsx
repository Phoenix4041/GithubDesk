import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useQuery } from "@tanstack/react-query";
import { RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { i18next } from "@/i18n";
import { flattenCommands, useCommandRegistry } from "@/features/commands/command-registry";
import { buildBindings, eventToCombo } from "@/features/commands/shortcut-model";
import { useSettingsStore } from "@/features/settings/store";
import { IS_MAC } from "@/shared/lib/platform";
import { reportError } from "@/shared/lib/report-error";
import { IconButton } from "@/shared/ui/icon-button";
import { ResizeHandle } from "@/shared/ui/resize-handle";
import { closeTerminal, listShells, openTerminal, resizeTerminal, writeTerminal } from "../api";
import type { ShellOption } from "../api";
import { TERMINAL_HEIGHT_RANGE, useTerminalStore } from "../store";
import { readTerminalTheme } from "../terminal-theme";

const PASSTHROUGH_COMMANDS = new Set(["palette.toggle", "terminal.toggle"]);

type Status = "starting" | "running" | "exited" | "error";

function shouldPassToApp(event: KeyboardEvent): boolean {
  const combo = eventToCombo(event, IS_MAC);
  if (!combo) {
    return false;
  }
  const commands = flattenCommands(useCommandRegistry.getState().sources);
  const owners = buildBindings(commands, useSettingsStore.getState().shortcuts).get(combo);
  if (!owners) {
    return false;
  }
  const command = commands.find((item) => owners.includes(item.id) && item.enabled);
  if (!command) {
    return false;
  }
  return PASSTHROUGH_COMMANDS.has(command.id) || combo.includes("Shift") || combo.includes("Alt");
}

interface TerminalPanelProps {
  repoPath: string;
}

export function TerminalPanel({ repoPath }: TerminalPanelProps) {
  const { t } = useTranslation();
  const open = useTerminalStore((state) => state.open);
  const height = useTerminalStore((state) => state.height);
  const setHeight = useTerminalStore((state) => state.setHeight);
  const hide = useTerminalStore((state) => state.hide);
  const shell = useSettingsStore((state) => state.terminalShell);
  const setShell = useSettingsStore((state) => state.setTerminalShell);
  const shells = useQuery({ queryKey: ["terminal", "shells"], queryFn: listShells, staleTime: Infinity });
  const [status, setStatus] = useState<Status>("starting");
  const [restartToken, setRestartToken] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) {
      return undefined;
    }
    const terminal = new Terminal({
      fontFamily: '"Cascadia Mono", "JetBrains Mono", Consolas, "SFMono-Regular", Menlo, monospace',
      fontSize: 12.5,
      cursorBlink: true,
      scrollback: 5000,
      theme: readTerminalTheme(),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(element);
    terminalRef.current = terminal;
    fitRef.current = fit;

    const dataSubscription = terminal.onData((data) => {
      const id = sessionRef.current;
      if (id) {
        void writeTerminal(id, data).catch(() => undefined);
      }
    });
    const resizeSubscription = terminal.onResize(({ cols, rows }) => {
      const id = sessionRef.current;
      if (id) {
        void resizeTerminal(id, cols, rows).catch(() => undefined);
      }
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") {
        return true;
      }
      const key = event.key.toLowerCase();
      if (event.ctrlKey && key === "c" && !event.altKey && terminal.hasSelection()) {
        void navigator.clipboard.writeText(terminal.getSelection());
        terminal.clearSelection();
        return false;
      }
      if (event.ctrlKey && event.shiftKey && key === "v") {
        void navigator.clipboard.readText().then((text) => terminal.paste(text));
        return false;
      }
      return !shouldPassToApp(event);
    });

    const observer = new ResizeObserver(() => {
      if (element.offsetParent !== null) {
        fit.fit();
      }
    });
    observer.observe(element);

    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = readTerminalTheme();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      themeObserver.disconnect();
      observer.disconnect();
      dataSubscription.dispose();
      resizeSubscription.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    const fit = fitRef.current;
    if (!terminal || !fit) {
      return undefined;
    }
    const id = crypto.randomUUID();
    let cancelled = false;
    terminal.reset();
    fit.fit();
    sessionRef.current = id;
    openTerminal(id, repoPath, shell, terminal.cols, terminal.rows, (event) => {
      if (cancelled) {
        return;
      }
      if (event.kind === "output") {
        terminal.write(event.data);
      } else {
        terminal.write(`\r\n\x1b[2m${i18next.t("terminal.exited")}\x1b[0m\r\n`);
        setStatus("exited");
      }
    })
      .then(() => {
        if (!cancelled) {
          setStatus("running");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus("error");
          reportError(error);
        }
      });
    return () => {
      cancelled = true;
      if (sessionRef.current === id) {
        sessionRef.current = null;
      }
      void closeTerminal(id).catch(() => undefined);
    };
  }, [repoPath, shell, restartToken]);

  useEffect(() => {
    if (open) {
      fitRef.current?.fit();
      terminalRef.current?.focus();
    }
  }, [open, height]);

  function restart() {
    setStatus("starting");
    setRestartToken((current) => current + 1);
  }

  function changeShell(value: string) {
    setStatus("starting");
    setShell(value === "" ? null : value);
  }

  const options: ShellOption[] = shells.data ?? [];

  return (
    <section
      aria-label={t("terminal.title")}
      hidden={!open}
      style={{ height }}
      className="flex shrink-0 flex-col border-t border-line bg-canvas"
    >
      <ResizeHandle
        orientation="horizontal"
        label={t("terminal.resize")}
        value={height}
        min={TERMINAL_HEIGHT_RANGE.min}
        max={TERMINAL_HEIGHT_RANGE.max}
        onChange={setHeight}
      />
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="text-xs font-semibold">{t("terminal.title")}</h2>
        <span className="text-[11px] text-muted" role="status">
          {t(`terminal.status.${status}`)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {options.length > 1 ? (
            <select
              aria-label={t("terminal.shell")}
              value={shell ?? ""}
              onChange={(event) => changeShell(event.target.value)}
              className="h-7 cursor-pointer rounded-md border border-line bg-surface px-1.5 text-xs text-fg focus-visible:border-accent focus-visible:outline-none"
            >
              <option value="">{t("terminal.defaultShell")}</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}
          <IconButton label={t("terminal.restart")} onClick={restart}>
            <RotateCw className="size-3.5" />
          </IconButton>
          <IconButton label={t("terminal.hide")} onClick={hide}>
            <X className="size-4" />
          </IconButton>
        </div>
      </header>
      <div ref={container} className="min-h-0 flex-1 overflow-hidden px-3 py-1.5" />
    </section>
  );
}
