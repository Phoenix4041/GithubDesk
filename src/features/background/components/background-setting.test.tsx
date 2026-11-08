import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { useSettingsStore } from "@/features/settings/store";
import { renderWithProviders } from "@/test/render";
import { BackgroundSetting } from "./background-setting";

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(): Calls {
  const calls: Calls = {};
  let autostart = false;
  mockIPC((command, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    (calls[command] ??= []).push(args);
    if (command === "autostart_get") {
      return autostart;
    }
    if (command === "autostart_set") {
      autostart = args.enabled === true;
      return autostart;
    }
    return null;
  });
  return calls;
}

function checkbox(key: ParseKeys): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("checkbox", { name: i18next.t(key) });
}

afterEach(() => {
  cleanup();
  clearMocks();
  useSettingsStore.setState({
    backgroundSyncEnabled: false,
    backgroundSyncMinutes: 5,
    trayEnabled: false,
    autostartEnabled: false,
  });
});

describe("BackgroundSetting", () => {
  it("keeps every option off by default", () => {
    serve();
    renderWithProviders(<BackgroundSetting />);
    expect(checkbox("background.syncLabel").checked).toBe(false);
    expect(checkbox("background.trayLabel").checked).toBe(false);
    expect(checkbox("background.autostartLabel").checked).toBe(false);
  });

  it("clamps the minutes typed by the user", () => {
    serve();
    useSettingsStore.setState({ backgroundSyncEnabled: true });
    renderWithProviders(<BackgroundSetting />);
    const input = screen.getByRole<HTMLInputElement>("spinbutton", { name: i18next.t("background.minutesLabel") });
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.blur(input);
    expect(useSettingsStore.getState().backgroundSyncMinutes).toBe(2);
    expect(input.value).toBe("2");
  });

  it("turns start with the system on through the backend", async () => {
    const calls = serve();
    renderWithProviders(<BackgroundSetting />);
    fireEvent.click(checkbox("background.autostartLabel"));
    await waitFor(() => expect(useSettingsStore.getState().autostartEnabled).toBe(true));
    expect(calls.autostart_set).toEqual([{ enabled: true }]);
  });
});
