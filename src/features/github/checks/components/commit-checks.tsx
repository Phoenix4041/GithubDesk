import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { useGithubTarget } from "../../components/github-gate";
import { ChecksList } from "../../pulls/components/checks-list";
import { summarizeChecks } from "../../pulls/pull-model";
import { useCommitChecks } from "../queries";
import { ChecksBadge } from "./checks-badge";

interface CommitChecksProps {
  repoPath: string;
  hash: string;
}

export function CommitChecks({ repoPath, hash }: CommitChecksProps) {
  const { t } = useTranslation();
  const { target } = useGithubTarget(repoPath);
  const checks = useCommitChecks(target, hash);
  const [open, setOpen] = useState(false);

  if (!checks.data || summarizeChecks(checks.data).state === "none") {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-subtle"
      >
        <ChecksBadge runs={checks.data} />
        <ChevronDown className={cn("size-3 text-muted transition-transform duration-150", open && "rotate-180")} />
        <span className="sr-only">{t("github.checks.toggle")}</span>
      </button>
      {open ? (
        <div className="max-h-44 overflow-y-auto">
          <ChecksList checks={checks.data} />
        </div>
      ) : null}
    </div>
  );
}
