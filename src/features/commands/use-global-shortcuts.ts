import { useEffect } from "react";
import { useSettingsStore } from "@/features/settings/store";
import { IS_MAC } from "@/shared/lib/platform";
import { reportError } from "@/shared/lib/report-error";
import { flattenCommands, useCommandRegistry } from "./command-registry";
import { useCommandUiStore } from "./command-ui-store";
import { buildBindings, eventToCombo } from "./shortcut-model";

const PALETTE_COMMAND = "palette.toggle";

function modalIsOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

export function useGlobalShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || useCommandUiStore.getState().recording) {
        return;
      }
      const combo = eventToCombo(event, IS_MAC);
      if (!combo) {
        return;
      }
      const commands = flattenCommands(useCommandRegistry.getState().sources);
      const bindings = buildBindings(commands, useSettingsStore.getState().shortcuts);
      const owners = bindings.get(combo);
      if (!owners) {
        return;
      }
      const command = commands.find((item) => owners.includes(item.id) && item.enabled);
      if (!command) {
        return;
      }
      if (modalIsOpen() && command.id !== PALETTE_COMMAND) {
        return;
      }
      event.preventDefault();
      Promise.resolve(command.run()).catch(reportError);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
