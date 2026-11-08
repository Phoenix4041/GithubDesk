import {
  Bug,
  CircleCheck,
  Copy,
  FileDown,
  GitBranchPlus,
  GitCommitHorizontal,
  History,
  ListOrdered,
  RotateCcw,
  Tag,
  Undo2,
} from "lucide-react";
import { i18next } from "@/i18n";
import { markFromHistory } from "@/features/bisect/actions";
import { useBranchDialogStore } from "@/features/branches/dialog-store";
import { exportCommitsAsPatches } from "@/features/patches/actions";
import { useRebaseDialogStore } from "@/features/rebase/store";
import { useTagDialogStore } from "@/features/tags/dialog-store";
import type { CommitSummary } from "@/shared/types/git";
import type { ContextMenuEntry } from "@/shared/ui/context-menu";
import {
  checkoutCommitDetached,
  cherryPickIntoCurrentBranch,
  resetCurrentBranchTo,
  revertSingleCommit,
} from "./commit-actions";
import { useCommitDialogStore } from "./commit-dialog-store";

interface CommitMenuInput {
  repoPath: string;
  commit: CommitSummary;
  selectedNewestFirst: readonly CommitSummary[];
}

export function buildCommitMenu({ repoPath, commit, selectedNewestFirst }: CommitMenuInput): ContextMenuEntry[] {
  const t = i18next.t.bind(i18next);
  const picks = selectedNewestFirst.length > 0 ? selectedNewestFirst : [commit];
  const canCherryPick = picks.every((candidate) => candidate.parents.length <= 1);
  const label = { hash: commit.shortHash };

  return [
    {
      label: t("commitActions.menu.createBranch"),
      icon: <GitBranchPlus className="size-4" />,
      onSelect: () =>
        useBranchDialogStore.getState().show({
          kind: "create",
          startPoint: { hash: commit.hash, label: commit.shortHash },
        }),
    },
    {
      label: t("commitActions.menu.createTag"),
      icon: <Tag className="size-4" />,
      onSelect: () =>
        useTagDialogStore.getState().show({ kind: "create", target: { hash: commit.hash, label: commit.shortHash } }),
    },
    {
      label: t("commitActions.menu.checkout", label),
      icon: <History className="size-4" />,
      onSelect: () => void checkoutCommitDetached(repoPath, commit.hash),
    },
    { kind: "separator" },
    {
      label: t("commitActions.menu.cherryPick", { count: picks.length }),
      icon: <GitCommitHorizontal className="size-4" />,
      disabled: !canCherryPick,
      onSelect: () =>
        void cherryPickIntoCurrentBranch(
          repoPath,
          [...picks].reverse().map((candidate) => candidate.hash),
        ),
    },
    {
      label: t("commitActions.menu.revert"),
      icon: <Undo2 className="size-4" />,
      onSelect: () => {
        if (commit.parents.length > 1) {
          useCommitDialogStore.getState().show({ kind: "revertMerge", commit });
        } else {
          void revertSingleCommit(repoPath, commit.hash, null);
        }
      },
    },
    {
      label: t("commitActions.menu.exportPatch", { count: picks.length }),
      icon: <FileDown className="size-4" />,
      disabled: picks.some((candidate) => candidate.parents.length > 1),
      onSelect: () =>
        void exportCommitsAsPatches(
          repoPath,
          [...picks].reverse().map((candidate) => candidate.hash),
        ),
    },
    { kind: "separator" },
    {
      label: t("bisect.menu.bad"),
      icon: <Bug className="size-4" />,
      onSelect: () => void markFromHistory(repoPath, "bad", commit.hash),
    },
    {
      label: t("bisect.menu.good"),
      icon: <CircleCheck className="size-4" />,
      onSelect: () => void markFromHistory(repoPath, "good", commit.hash),
    },
    { kind: "separator" },
    {
      label: t("commitActions.menu.resetSoft"),
      icon: <RotateCcw className="size-4" />,
      onSelect: () => void resetCurrentBranchTo(repoPath, commit.hash, "soft"),
    },
    {
      label: t("commitActions.menu.resetMixed"),
      icon: <RotateCcw className="size-4" />,
      onSelect: () => void resetCurrentBranchTo(repoPath, commit.hash, "mixed"),
    },
    {
      label: t("commitActions.menu.resetHard"),
      icon: <RotateCcw className="size-4" />,
      destructive: true,
      onSelect: () => useCommitDialogStore.getState().show({ kind: "resetHard", commit }),
    },
    { kind: "separator" },
    {
      label: t("commitActions.menu.rebase"),
      icon: <ListOrdered className="size-4" />,
      disabled: commit.refs.some((ref) => ref.kind === "head"),
      onSelect: () => useRebaseDialogStore.getState().show({ base: commit.hash, label: commit.shortHash }),
    },
    { kind: "separator" },
    {
      label: t("commitActions.menu.copyHash"),
      icon: <Copy className="size-4" />,
      onSelect: () => void navigator.clipboard.writeText(commit.hash),
    },
  ];
}
