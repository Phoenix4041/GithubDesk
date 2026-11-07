import type { ParseKeys } from "i18next";
import { FileWarning } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DiffHeader } from "@/features/diff/components/diff-header";
import { useLanguageSupport } from "@/features/diff/use-language-support";
import { describeError } from "@/shared/lib/report-error";
import type { ConflictFile, ConflictKind, ConflictSide } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { CodeEditor } from "@/shared/ui/code-editor";
import type { CodeEditorHandle } from "@/shared/ui/code-editor";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { resolveConflictWithContent, resolveConflictWithSide } from "../actions";
import { conflictHighlighting } from "../conflict-extension";
import { parseConflictRegions, resolveAllRegions, resolveRegion } from "../conflict-model";
import type { ConflictChoice } from "../conflict-model";
import { useConflictFile } from "../queries";

interface ConflictEditorProps {
  repoPath: string;
  path: string;
}

interface SidePanelProps {
  repoPath: string;
  file: ConflictFile;
}

const CHOICE_BUTTONS: Array<{ choice: ConflictChoice; labelKey: ParseKeys }> = [
  { choice: "ours", labelKey: "conflicts.region.ours" },
  { choice: "theirs", labelKey: "conflicts.region.theirs" },
  { choice: "both", labelKey: "conflicts.region.both" },
];

function SideChoicePanel({ repoPath, file }: SidePanelProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<ConflictSide | null>(null);

  const kind: ConflictKind = file.kind;
  const textual = !file.binary && !file.tooLarge;

  let titleKey: ParseKeys = "conflicts.binary.title";
  let descriptionKey: ParseKeys = file.tooLarge ? "conflicts.tooLarge.description" : "conflicts.binary.description";
  let oursLabelKey: ParseKeys = "conflicts.useMine";
  let theirsLabelKey: ParseKeys = "conflicts.useTheirs";

  if (textual && kind === "deletedByUs") {
    titleKey = "conflicts.deletedByUs.title";
    descriptionKey = "conflicts.deletedByUs.description";
    oursLabelKey = "conflicts.deleteFile";
    theirsLabelKey = "conflicts.keepIncoming";
  } else if (textual && kind === "deletedByThem") {
    titleKey = "conflicts.deletedByThem.title";
    descriptionKey = "conflicts.deletedByThem.description";
    oursLabelKey = "conflicts.keepMine";
    theirsLabelKey = "conflicts.deleteFile";
  } else if (textual && kind === "bothDeleted") {
    titleKey = "conflicts.bothDeleted.title";
    descriptionKey = "conflicts.bothDeleted.description";
    oursLabelKey = "conflicts.confirmDeletion";
  }

  async function choose(side: ConflictSide) {
    setPending(side);
    await resolveConflictWithSide(repoPath, file.path, side);
    setPending(null);
  }

  return (
    <EmptyState
      icon={<FileWarning className="size-5" />}
      title={t(titleKey)}
      description={t(descriptionKey)}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" loading={pending === "ours"} disabled={pending !== null} onClick={() => void choose("ours")}>
            {t(oursLabelKey)}
          </Button>
          {kind !== "bothDeleted" ? (
            <Button loading={pending === "theirs"} disabled={pending !== null} onClick={() => void choose("theirs")}>
              {t(theirsLabelKey)}
            </Button>
          ) : null}
        </div>
      }
    />
  );
}

interface TextEditorProps extends SidePanelProps {
  working: string;
}

function ThreePaneEditor({ repoPath, file, working }: TextEditorProps) {
  const { t } = useTranslation();
  const support = useLanguageSupport(file.path);
  const [result, setResult] = useState(working);
  const [saving, setSaving] = useState(false);
  const resultHandle = useRef<CodeEditorHandle>(null);
  const markers = useMemo(() => conflictHighlighting(), []);
  const resultExtensions = useMemo(() => [markers], [markers]);

  const regions = useMemo(() => parseConflictRegions(result), [result]);
  const unresolved = regions.length;
  const initialRegions = useMemo(() => parseConflictRegions(working), [working]);
  const oursLabel = initialRegions[0]?.oursLabel;
  const theirsLabel = initialRegions[0]?.theirsLabel;

  async function markResolved() {
    setSaving(true);
    await resolveConflictWithContent(repoPath, file.path, result, file.lineEnding);
    setSaving(false);
  }

  function paneTitle(base: string, label: string | undefined): string {
    return label ? `${base} · ${label}` : base;
  }

  return (
    <>
      <DiffHeader path={file.path} />
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <span role="status" className="text-xs font-medium">
          {unresolved > 0 ? t("conflicts.remaining", { count: unresolved }) : t("conflicts.noneLeft")}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={unresolved === 0} onClick={() => setResult((current) => resolveAllRegions(current, "ours"))}>
            {t("conflicts.useAllMine")}
          </Button>
          <Button size="sm" disabled={unresolved === 0} onClick={() => setResult((current) => resolveAllRegions(current, "theirs"))}>
            {t("conflicts.useAllTheirs")}
          </Button>
          <Button size="sm" disabled={result === working} onClick={() => setResult(working)}>
            {t("conflicts.reset")}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={unresolved > 0}
            loading={saving}
            title={unresolved > 0 ? t("conflicts.unresolvedHint") : undefined}
            onClick={() => void markResolved()}
          >
            {t("conflicts.markResolved")}
          </Button>
        </div>
      </div>
      <div className="grid h-[34%] min-h-[140px] grid-cols-2 divide-x divide-line border-b border-line">
        <section className="flex min-h-0 min-w-0 flex-col">
          <h3 className="truncate border-b border-line bg-canvas px-3 py-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
            {paneTitle(t("conflicts.panes.ours"), oursLabel)}
          </h3>
          <CodeEditor value={file.ours ?? ""} readOnly language={support} ariaLabel={t("conflicts.panes.ours")} />
        </section>
        <section className="flex min-h-0 min-w-0 flex-col">
          <h3 className="truncate border-b border-line bg-canvas px-3 py-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
            {paneTitle(t("conflicts.panes.theirs"), theirsLabel)}
          </h3>
          <CodeEditor value={file.theirs ?? ""} readOnly language={support} ariaLabel={t("conflicts.panes.theirs")} />
        </section>
      </div>
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3 overflow-x-auto border-b border-line bg-canvas px-3 py-1.5">
          <h3 className="shrink-0 text-[11px] font-semibold tracking-wide text-muted uppercase">{t("conflicts.panes.result")}</h3>
          {regions.map((region, position) => (
            <div key={`${region.startLine}-${position}`} className="flex shrink-0 items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => resultHandle.current?.scrollToLine(region.startLine + 1)}
                className="cursor-pointer font-medium text-accent hover:underline"
              >
                {t("conflicts.region.title", { number: position + 1 })}
              </button>
              {CHOICE_BUTTONS.map((item) => (
                <Button
                  key={item.choice}
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5"
                  onClick={() => setResult((current) => resolveRegion(current, position, item.choice))}
                >
                  {t(item.labelKey)}
                </Button>
              ))}
            </div>
          ))}
        </div>
        <CodeEditor
          value={result}
          onChange={setResult}
          language={support}
          extensions={resultExtensions}
          handle={resultHandle}
          ariaLabel={t("conflicts.panes.result")}
        />
      </section>
    </>
  );
}

export function ConflictEditor({ repoPath, path }: ConflictEditorProps) {
  const { t } = useTranslation();
  const conflict = useConflictFile(repoPath, path);
  const showSkeleton = useSkeletonVisible(conflict.isPending);

  if (showSkeleton) {
    return (
      <>
        <DiffHeader path={path} />
        <SkeletonRows count={14} rowHeight={20} />
      </>
    );
  }
  if (conflict.isPending) {
    return <DiffHeader path={path} />;
  }
  if (conflict.isError) {
    const description = describeError(conflict.error);
    return (
      <>
        <DiffHeader path={path} />
        <ErrorState title={description.title} message={description.message} onRetry={() => void conflict.refetch()} />
      </>
    );
  }

  const file = conflict.data;
  const editable =
    !file.binary && !file.tooLarge && file.working !== null && (file.kind === "bothModified" || file.kind === "bothAdded");

  if (!editable) {
    return (
      <>
        <DiffHeader path={file.path} />
        <SideChoicePanel repoPath={repoPath} file={file} />
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-label={t("conflicts.editorLabel", { path })}>
      <ThreePaneEditor repoPath={repoPath} file={file} working={file.working ?? ""} />
    </div>
  );
}
