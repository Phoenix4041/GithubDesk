import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { useRepositoryDialogStore } from "@/features/repositories/dialog-store";
import { useToastStore } from "@/shared/ui/toast-store";
import type { LaunchRequest } from "./api";
import { LAUNCH_EVENT } from "./api";
import { useLaunchRequests } from "./use-launch-requests";

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(queue: Array<LaunchRequest | null>): Calls {
  const calls: Calls = {};
  mockIPC(
    (command, payload) => {
      (calls[command] ??= []).push((payload ?? {}) as Record<string, unknown>);
      if (command === "launch_take_pending") {
        return queue.shift() ?? null;
      }
      if (command === "repo_open") {
        return Promise.reject(new Error("not a repository"));
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  return calls;
}

afterEach(() => {
  cleanup();
  clearMocks();
  useRepositoryDialogStore.getState().hide();
  useToastStore.setState({ toasts: [] });
});

describe("useLaunchRequests", () => {
  it("opens the clone dialog for a pending link and mentions the branch", async () => {
    serve([{ kind: "clone", url: "https://github.com/octo/hello", branch: "dev" }]);

    renderHook(() => useLaunchRequests());

    await waitFor(() => expect(useRepositoryDialogStore.getState().dialog).toBe("clone"));
    expect(useRepositoryDialogStore.getState().clonePreset).toEqual({ url: "https://github.com/octo/hello", accountId: null });
    const toast = useToastStore.getState().toasts[0];
    expect(toast?.kind).toBe("info");
    expect(toast?.message).toBe(i18next.t("launch.cloneBranch", { branch: "dev" }));
  });

  it("does not show a toast when the link has no branch", async () => {
    serve([{ kind: "clone", url: "https://github.com/octo/hello", branch: null }]);

    renderHook(() => useLaunchRequests());

    await waitFor(() => expect(useRepositoryDialogStore.getState().dialog).toBe("clone"));
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("takes the pending request again when a later launch is announced", async () => {
    const calls = serve([null, { kind: "open", path: "C:/repos/hello" }]);

    renderHook(() => useLaunchRequests());
    await waitFor(() => expect(calls.launch_take_pending).toHaveLength(1));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    await emit(LAUNCH_EVENT, { kind: "open", path: "C:/repos/hello" });

    await waitFor(() => expect(calls.repo_open).toEqual([{ path: "C:/repos/hello" }]));
    expect(calls.launch_take_pending).toHaveLength(2);
  });
});
