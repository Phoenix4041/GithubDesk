import { useQuery } from "@tanstack/react-query";
import { GitPullRequestArrow, Layers, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useBranches } from "@/features/branches/queries";
import { useGithubTarget } from "@/features/github/components/github-gate";
import { repoKeys } from "@/shared/lib/query-client";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { IconButton } from "@/shared/ui/icon-button";
import { Skeleton } from "@/shared/ui/skeleton";
import { SelectField } from "@/shared/ui/text-field";
import { changeParent, openChainedPulls, restackAll } from "../actions";
import { listStack } from "../api";
import { useStackDialogStore } from "../store";

function Body({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const stack = useQuery({ queryKey: repoKeys.stack(repoPath), queryFn: () => listStack(repoPath), staleTime: 0, retry: false });
  const branches = useBranches(repoPath);
  const { target } = useGithubTarget(repoPath);
  const [branch, setBranch] = useState("");
  const [parent, setParent] = useState("");
  const [busy, setBusy] = useState(false);

  const locals = (branches.data ?? []).filter((candidate) => !candidate.isRemote).map((candidate) => candidate.name);

  async function wrap(work: () => Promise<unknown>) {
    setBusy(true);
    await work();
    setBusy(false);
  }

  if (stack.isPending) {
    return <Skeleton className="h-32" />;
  }
  if (stack.isError) {
    const description = describeError(stack.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void stack.refetch()} />;
  }
  const nodes = stack.data;
  const needsRestack = nodes.some((node) => node.needsRestack);

  return (
    <div className="flex flex-col gap-3">
      {nodes.length === 0 ? (
        <EmptyState icon={<Layers className="size-5" />} title={t("stack.empty.title")} description={t("stack.empty.description")} />
      ) : (
        <ul className="flex max-h-60 flex-col overflow-y-auto rounded-lg border border-line" aria-label={t("stack.listLabel")}>
          {nodes.map((node) => (
            <li key={node.name} className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0" style={{ paddingLeft: 12 + node.depth * 18 }}>
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {node.name}
                {node.isCurrent ? <span className="ml-2 rounded bg-accent-soft px-1.5 py-px text-[10px] text-accent">{t("stack.current")}</span> : null}
              </span>
              {node.parent ? <span className="shrink-0 text-[11px] text-muted">{t("stack.ahead", { count: node.ahead })}</span> : null}
              {node.needsRestack ? <span className="shrink-0 rounded bg-warning/15 px-1.5 py-px text-[10px] text-warning">{t("stack.needsRestack")}</span> : null}
              {node.parent ? (
                <IconButton label={t("stack.remove", { name: node.name })} onClick={() => void wrap(() => changeParent(repoPath, node.name, null))} className="size-6" disabled={busy}>
                  <X className="size-3.5" />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <SelectField label={t("stack.branch")} value={branch} onChange={(event) => setBranch(event.target.value)} className="w-44">
          <option value="" />
          {locals.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </SelectField>
        <SelectField label={t("stack.parent")} value={parent} onChange={(event) => setParent(event.target.value)} className="w-44">
          <option value="" />
          {locals
            .filter((name) => name !== branch)
            .map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
        </SelectField>
        <Button
          disabled={branch === "" || parent === "" || busy}
          onClick={() =>
            void wrap(async () => {
              if (await changeParent(repoPath, branch, parent)) {
                setBranch("");
                setParent("");
              }
            })
          }
        >
          {t("stack.place")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<RefreshCw className="size-3.5" />} disabled={!needsRestack || busy} loading={busy} onClick={() => void wrap(() => restackAll(repoPath))}>
          {t("stack.restack")}
        </Button>
        {target ? (
          <Button icon={<GitPullRequestArrow className="size-3.5" />} disabled={nodes.every((node) => node.parent === null) || busy} onClick={() => void wrap(() => openChainedPulls(repoPath, target, nodes))}>
            {t("stack.openPulls")}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted">{t("stack.hint")}</p>
    </div>
  );
}

export function StackDialog({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const open = useStackDialogStore((state) => state.open);
  const hide = useStackDialogStore((state) => state.hide);
  if (!open) {
    return null;
  }
  return (
    <Dialog open title={t("stack.title")} description={t("stack.description")} onClose={hide} width="lg" footer={<Button onClick={hide}>{t("common.close")}</Button>}>
      <Body repoPath={repoPath} />
    </Dialog>
  );
}
