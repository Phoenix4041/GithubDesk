import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import { COMMAND_GROUP_ORDER } from "./command-model";
import { isValidCombo } from "./shortcut-model";
import { buildGlobalCommands, buildRepoCommands } from "./use-app-commands";

const commands = [...buildGlobalCommands(), ...buildRepoCommands("C:/repo", true, true)];

function lookup(tree: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((node, part) => {
    if (typeof node === "object" && node !== null && part in node) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, tree);
}

describe("application commands", () => {
  it("have unique ids", () => {
    const ids = commands.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never share a default shortcut", () => {
    const seen = new Map<string, string>();
    for (const command of commands) {
      if (!command.defaultShortcut) {
        continue;
      }
      const owner = seen.get(command.defaultShortcut);
      expect(owner, `${command.id} reuses ${command.defaultShortcut} of ${owner}`).toBeUndefined();
      seen.set(command.defaultShortcut, command.id);
    }
  });

  it("only use shortcuts that can be typed safely", () => {
    for (const command of commands) {
      if (command.defaultShortcut) {
        expect(isValidCombo(command.defaultShortcut), `${command.id}: ${command.defaultShortcut}`).toBe(true);
      }
    }
  });

  it("have a title in both languages and a known group", () => {
    for (const command of commands) {
      expect(typeof lookup(es, command.titleKey), `es ${command.titleKey}`).toBe("string");
      expect(typeof lookup(en, command.titleKey), `en ${command.titleKey}`).toBe("string");
      expect(COMMAND_GROUP_ORDER).toContain(command.group);
    }
  });

  it("disable the github commands when the repository has no usable account", () => {
    const without = buildRepoCommands("C:/repo", true, false);
    for (const id of ["nav.pulls", "nav.issues", "nav.actions", "github.issue.new", "github.pull.new", "github.workflow.run"]) {
      expect(without.find((command) => command.id === id)?.enabled, id).toBe(false);
    }
    const noRemote = buildRepoCommands("C:/repo", false, true);
    expect(noRemote.find((command) => command.id === "nav.pulls")?.enabled).toBe(false);
    expect(buildRepoCommands("C:/repo", true, true).find((command) => command.id === "nav.pulls")?.enabled).toBe(true);
  });
});
