import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { i18next } from "@/i18n";
import { repoKeys } from "@/shared/lib/query-client";
import { performRepoAction } from "@/shared/lib/repo-action";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog } from "@/shared/ui/dialog";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { TextField } from "@/shared/ui/text-field";
import { showToast } from "@/shared/ui/toast-store";
import { listSplitFiles, splitCommit } from "../api";
import { useSplitDialogStore } from "../store";

function Form({ repoPath, hash, title, onClose }: { repoPath: string; hash: string; title: string; onClose: () => void }) {
  const { t } = useTranslation();
  const files = useQuery({ queryKey: repoKeys.splitFiles(repoPath, hash), queryFn: () => listSplitFiles(repoPath, hash), staleTime: 0, retry: false });
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [first, setFirst] = useState(title);
  const [second, setSecond] = useState(title);
  const [busy, setBusy] = useState(false);

  if (files.isPending) {
    return <Skeleton className="h-32" />;
  }
  if (files.isError) {
    const description = describeError(files.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void files.refetch()} />;
  }
  const all = files.data;
  const valid = chosen.size > 0 && chosen.size < all.length && first.trim().length > 0 && second.trim().length > 0;

  function toggle(path: string) {
    const next = new Set(chosen);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setChosen(next);
  }

  async function run() {
    setBusy(true);
    const done = await performRepoAction(repoPath, () => splitCommit(repoPath, hash, Array.from(chosen), first.trim(), second.trim()));
    setBusy(false);
    if (done) {
      showToast({ kind: "success", title: i18next.t("split.done") });
      onClose();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">{t("split.pick")}</p>
      <ul className="flex max-h-48 flex-col overflow-y-auto rounded-lg border border-line" aria-label={t("split.filesLabel")}>
        {all.map((path) => (
          <li key={path} className="flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0">
            <Checkbox label={path} checked={chosen.has(path)} onChange={() => toggle(path)} />
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{path}</span>
          </li>
        ))}
      </ul>
      <TextField label={t("split.firstMessage")} value={first} onChange={(event) => setFirst(event.target.value)} />
      <TextField label={t("split.secondMessage")} value={second} onChange={(event) => setSecond(event.target.value)} />
      <p className="text-xs text-muted">{t("split.hint")}</p>
      <div>
        <Button variant="primary" disabled={!valid} loading={busy} onClick={() => void run()}>
          {t("split.run")}
        </Button>
      </div>
    </div>
  );
}

export function SplitDialog({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const target = useSplitDialogStore((state) => state.target);
  const hide = useSplitDialogStore((state) => state.hide);
  if (!target) {
    return null;
  }
  return (
    <Dialog
      open
      title={t("split.title", { hash: target.shortHash })}
      description={t("split.description")}
      onClose={hide}
      width="lg"
      footer={<Button onClick={hide}>{t("common.close")}</Button>}
    >
      <Form key={target.hash} repoPath={repoPath} hash={target.hash} title={target.title} onClose={hide} />
    </Dialog>
  );
}
