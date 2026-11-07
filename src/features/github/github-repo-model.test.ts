import { describe, expect, it } from "vitest";
import type { GithubAccount, RemoteRepo } from "@/shared/types/git";
import { buildRepoContext, chooseAccount, pickGithubRemote, repositoryUrl } from "./github-repo-model";

function remote(name: string, host: string, owner = "octo", repo = "hello"): RemoteRepo {
  return { remoteName: name, url: `https://${host}/${owner}/${repo}.git`, host, owner, name: repo };
}

function account(login: string, host = "github.com"): GithubAccount {
  return { id: `${host}:${login}`, host, login, name: null, avatarUrl: "", source: "token" };
}

describe("pickGithubRemote", () => {
  it("prefers the first remote on github.com or on a host with a connected account", () => {
    const remotes = [remote("backup", "gitlab.com"), remote("origin", "github.com"), remote("work", "git.corp.example")];
    expect(pickGithubRemote(remotes, [])?.remoteName).toBe("origin");
    expect(pickGithubRemote([remotes[0]!, remotes[2]!], [account("ana", "git.corp.example")])?.remoteName).toBe("work");
  });

  it("returns nothing when no remote is on a known host", () => {
    expect(pickGithubRemote([remote("origin", "gitlab.com")], [])).toBeNull();
    expect(pickGithubRemote([], [account("ana")])).toBeNull();
  });
});

describe("chooseAccount", () => {
  it("uses the remembered account when it still exists", () => {
    const accounts = [account("ana"), account("beto")];
    expect(chooseAccount(accounts, "github.com:beto")?.login).toBe("beto");
  });

  it("falls back to the first candidate and handles none", () => {
    const accounts = [account("ana"), account("beto")];
    expect(chooseAccount(accounts, "github.com:gone")?.login).toBe("ana");
    expect(chooseAccount(accounts, undefined)?.login).toBe("ana");
    expect(chooseAccount([], "x")).toBeNull();
  });
});

describe("buildRepoContext", () => {
  it("only offers accounts of the same host as the remote", () => {
    const accounts = [account("ana"), account("corp", "git.corp.example")];
    const context = buildRepoContext([remote("origin", "github.com")], accounts, undefined);
    expect(context?.candidates.map((item) => item.login)).toEqual(["ana"]);
    expect(context?.account?.login).toBe("ana");
  });

  it("keeps the repository usable without an account", () => {
    const context = buildRepoContext([remote("origin", "github.com")], [], undefined);
    expect(context?.account).toBeNull();
    expect(context?.remote.owner).toBe("octo");
  });

  it("is null for repositories outside GitHub", () => {
    expect(buildRepoContext([remote("origin", "gitlab.com")], [account("ana")], undefined)).toBeNull();
  });
});

describe("repositoryUrl", () => {
  it("builds the web address of the repository", () => {
    expect(repositoryUrl(remote("origin", "github.com", "octo", "hello"))).toBe("https://github.com/octo/hello");
    expect(repositoryUrl(remote("origin", "127.0.0.1:9000"))).toBe("http://127.0.0.1:9000/octo/hello");
  });
});
