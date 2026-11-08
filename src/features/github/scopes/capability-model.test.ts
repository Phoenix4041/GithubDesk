import { describe, expect, it } from "vitest";
import type { TokenInfo } from "@/shared/types/git";
import {
  authorizedAppsUrl,
  daysUntil,
  missingCapabilities,
  preselectedCapabilities,
  scopesFromErrorDetail,
  scopesToRequest,
  tokenCreationUrl,
  tokensPageUrl,
} from "./capability-model";

const INFO: TokenInfo = {
  login: "octo",
  scopes: ["repo", "workflow", "read:org", "gist"],
  expiresAt: null,
  rateLimit: null,
  capabilities: [
    { id: "repos", request: ["repo"], granted: true },
    { id: "orgRead", request: ["read:org"], granted: true },
    { id: "orgAdmin", request: ["admin:org"], granted: false },
    { id: "sshKeys", request: ["admin:public_key"], granted: false },
    { id: "deleteRepo", request: ["delete_repo"], granted: false },
  ],
};

describe("capability model", () => {
  it("lists only the capabilities the token certainly lacks", () => {
    expect(missingCapabilities(INFO).map((item) => item.id)).toEqual(["orgAdmin", "sshKeys", "deleteRepo"]);
    const hidden: TokenInfo = {
      ...INFO,
      scopes: null,
      capabilities: INFO.capabilities.map((item) => ({ ...item, granted: null })),
    };
    expect(missingCapabilities(hidden)).toEqual([]);
  });

  it("preselects what the failing request asked for", () => {
    expect(Array.from(preselectedCapabilities(INFO, ["admin:org", "write:org"], []))).toEqual(["orgAdmin"]);
    expect(Array.from(preselectedCapabilities(INFO, [], ["sshKeys"]))).toEqual(["sshKeys"]);
    expect(preselectedCapabilities(INFO, ["repo"], []).size).toBe(0);
    expect(preselectedCapabilities(INFO, [], []).size).toBe(0);
  });

  it("asks for the current scopes plus the ones of the chosen capabilities", () => {
    const requested = scopesToRequest(INFO, new Set(["orgAdmin", "deleteRepo"]));
    expect(requested).toEqual(["repo", "workflow", "read:org", "gist", "admin:org", "delete_repo"]);
    expect(scopesToRequest(INFO, new Set())).toEqual(["repo", "workflow", "read:org", "gist"]);
    expect(scopesToRequest({ ...INFO, scopes: null }, new Set(["sshKeys"]))).toEqual(["admin:public_key"]);
  });

  it("builds the GitHub pages to create, review and revoke tokens", () => {
    expect(tokenCreationUrl("github.com", ["repo", "admin:org"])).toBe(
      "https://github.com/settings/tokens/new?scopes=repo%2Cadmin%3Aorg&description=GithubDesk",
    );
    expect(tokensPageUrl("git.company.example")).toBe("https://git.company.example/settings/tokens");
    expect(authorizedAppsUrl("github.com")).toBe("https://github.com/settings/applications");
    expect(tokensPageUrl("127.0.0.1:18765")).toBe("http://127.0.0.1:18765/settings/tokens");
  });

  it("counts the days left before a token expires", () => {
    const now = Date.parse("2026-11-01T00:00:00Z");
    expect(daysUntil("2026-11-11T00:00:00Z", now)).toBe(10);
    expect(daysUntil("2026-10-30T12:00:00Z", now)).toBe(-1);
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil("soon", now)).toBeNull();
  });

  it("reads the scopes named by an error", () => {
    expect(scopesFromErrorDetail("admin:org, write:org")).toEqual(["admin:org", "write:org"]);
    expect(scopesFromErrorDetail("")).toEqual([]);
  });
});
