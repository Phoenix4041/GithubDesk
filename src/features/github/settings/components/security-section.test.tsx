import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import type { SecurityAlert } from "./security-section";
import { SecuritySection, severityOf, sortBySeverity } from "./security-section";

const opener = vi.hoisted(() => vi.fn());

vi.mock("@/shared/lib/external", () => ({ openExternal: opener }));

function alert(number: number, severity: string, name: string): SecurityAlert {
  return {
    number,
    state: "open",
    dependency: { package: { name, ecosystem: "npm" }, manifestPath: "package.json" },
    securityAdvisory: { summary: `Flaw in ${name}`, severity, cveId: number === 3 ? "CVE-2026-0001" : null },
    htmlUrl: `https://github.com/acme/app/security/dependabot/${number}`,
    createdAt: "2026-02-01T10:00:00Z",
  };
}

const TARGET = { accountId: "github.com:octo", host: "github.com", owner: "acme", repo: "app", remoteName: "origin" };

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

describe("security alerts", () => {
  beforeEach(() => {
    opener.mockReset();
  });

  it("orders by severity and falls back to low for unknown values", () => {
    const sorted = sortBySeverity([alert(1, "low", "a"), alert(2, "critical", "b"), alert(3, "weird", "c"), alert(4, "high", "d")]);
    expect(sorted.map((entry) => entry.number)).toEqual([2, 4, 3, 1]);
    expect(severityOf("weird")).toBe("low");
  });

  it("lists the open alerts with their severity and opens one on GitHub", async () => {
    mockIPC((command) => (command === "github_security_alerts" ? [alert(1, "low", "left-pad"), alert(2, "critical", "lodash")] : null));
    renderWithProviders(<SecuritySection target={TARGET} />);
    const list = await screen.findByRole("list", { name: t("github.settings.sections.security") });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]?.textContent).toContain("Flaw in lodash");
    expect(rows[0]?.textContent).toContain(t("github.settings.security.severity.critical"));
    fireEvent.click(within(rows[0] as HTMLElement).getByRole("button", { name: t("github.settings.security.open") }));
    await waitFor(() => expect(opener).toHaveBeenCalledWith("https://github.com/acme/app/security/dependabot/2"));
  });

  it("says there are no alerts", async () => {
    mockIPC((command) => (command === "github_security_alerts" ? [] : null));
    renderWithProviders(<SecuritySection target={TARGET} />);
    expect(await screen.findByText(t("github.settings.security.none"))).toBeTruthy();
  });
});
