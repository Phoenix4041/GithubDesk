import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n";
import type { SecretFinding } from "../api";
import { SecretScanDialog } from "./secret-scan-dialog";

const FINDINGS: SecretFinding[] = [
  { file: "src/config.ts", line: 12, rule: "github-token" },
  { file: ".env", line: 0, rule: "env-file" },
];

function setup(open = true) {
  const handlers = {
    onUnstage: vi.fn(),
    onIgnore: vi.fn(),
    onCommitAnyway: vi.fn(),
    onCancel: vi.fn(),
  };
  render(<SecretScanDialog open={open} findings={FINDINGS} busy={false} {...handlers} />);
  return handlers;
}

describe("SecretScanDialog", () => {
  it("lists every finding with its location and rule", () => {
    setup();
    expect(screen.getByText("src/config.ts:12")).toBeTruthy();
    expect(screen.getByText(".env")).toBeTruthy();
    expect(screen.getByText(i18next.t("secretScan.rules.githubToken"))).toBeTruthy();
    expect(screen.getByText(i18next.t("secretScan.rules.envFile"))).toBeTruthy();
  });

  it("offers the three ways forward and each one calls its handler", () => {
    const handlers = setup();
    fireEvent.click(screen.getByRole("button", { name: i18next.t("secretScan.unstage") }));
    fireEvent.click(screen.getByRole("button", { name: i18next.t("secretScan.addToGitignore") }));
    fireEvent.click(screen.getByRole("button", { name: i18next.t("secretScan.commitAnyway") }));
    fireEvent.click(screen.getByRole("button", { name: i18next.t("common.cancel") }));
    expect(handlers.onUnstage).toHaveBeenCalledTimes(1);
    expect(handlers.onIgnore).toHaveBeenCalledTimes(1);
    expect(handlers.onCommitAnyway).toHaveBeenCalledTimes(1);
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while closed", () => {
    setup(false);
    expect(screen.queryByText(i18next.t("secretScan.title"))).toBeNull();
  });
});
