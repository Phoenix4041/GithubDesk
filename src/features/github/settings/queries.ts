import { useQuery } from "@tanstack/react-query";
import { targetKey } from "../target";
import type { GithubTarget } from "../target";
import {
  getProtection,
  getRepoSettings,
  listBranches,
  listCollaborators,
  listDeployKeys,
  listHooks,
  listInvitations,
  listTeamAccess,
} from "./api";

export function useRepoSettings(target: GithubTarget) {
  return useQuery({
    queryKey: targetKey(target, "settings"),
    queryFn: () => getRepoSettings(target),
    staleTime: 30_000,
    retry: false,
  });
}

export function useCollaborators(target: GithubTarget) {
  return useQuery({
    queryKey: targetKey(target, "collaborators"),
    queryFn: () => listCollaborators(target),
    staleTime: 30_000,
    retry: false,
  });
}

export function useInvitations(target: GithubTarget) {
  return useQuery({
    queryKey: targetKey(target, "invitations"),
    queryFn: () => listInvitations(target),
    staleTime: 30_000,
    retry: false,
  });
}

export function useTeamAccess(target: GithubTarget, enabled: boolean) {
  return useQuery({
    queryKey: targetKey(target, "team-access"),
    queryFn: () => listTeamAccess(target),
    staleTime: 30_000,
    enabled,
    retry: false,
  });
}

export function useBranches(target: GithubTarget) {
  return useQuery({
    queryKey: targetKey(target, "branches"),
    queryFn: () => listBranches(target),
    staleTime: 30_000,
    retry: false,
  });
}

export function useProtection(target: GithubTarget, branch: string | null) {
  return useQuery({
    queryKey: targetKey(target, "protection", branch),
    queryFn: () => getProtection(target, branch ?? ""),
    enabled: branch !== null,
    staleTime: 0,
    retry: false,
  });
}

export function useHooks(target: GithubTarget) {
  return useQuery({
    queryKey: targetKey(target, "hooks"),
    queryFn: () => listHooks(target),
    staleTime: 30_000,
    retry: false,
  });
}

export function useDeployKeys(target: GithubTarget) {
  return useQuery({
    queryKey: targetKey(target, "deploy-keys"),
    queryFn: () => listDeployKeys(target),
    staleTime: 30_000,
    retry: false,
  });
}
