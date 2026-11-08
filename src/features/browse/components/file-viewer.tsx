import { FileQuestion, FileX, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLanguageSupport } from "@/features/diff/use-language-support";
import { describeError } from "@/shared/lib/report-error";
import { highlightLine } from "@/shared/lib/syntax";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { SkeletonRows } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { restoreFileToRevision } from "../actions";
import { imageDataUrl } from "../image-path";
import { useFileContent } from "../queries";

const ROW_HEIGHT = 20;
const CHARACTER_WIDTH = 7.4;
const NUMBER_WIDTH = 52;

interface FileViewerProps {
  repoPath: string;
  revision: string;
  label: string;
  path: string;
}

function splitLines(text: string): string[] {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function TextLine({ text, number, support }: { text: string; number: number; support: ReturnType<typeof useLanguageSupport> }) {
  const segments = useMemo(() => (support ? highlightLine(support, text) : [{ text, className: null }]), [support, text]);
  return (
    <div className="flex h-5 font-mono text-xs leading-5">
      <span className="w-[52px] shrink-0 pr-3 text-right text-muted/80 tabular-nums">{number}</span>
      <span className="selectable pr-4 whitespace-pre">
        {segments.map((segment, index) => (
          <span key={index} className={segment.className ?? undefined}>
            {segment.text}
          </span>
        ))}
      </span>
    </div>
  );
}

export function FileViewer({ repoPath, revision, label, path }: FileViewerProps) {
  const { t } = useTranslation();
  const content = useFileContent(repoPath, { kind: "revision", revision }, path);
  const support = useLanguageSupport(path);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const lines = useMemo(() => splitLines(content.data?.text ?? ""), [content.data?.text]);
  const longest = useMemo(() => lines.reduce((max, line) => Math.max(max, line.length), 0), [lines]);

  async function restore() {
    setBusy(true);
    const succeeded = await restoreFileToRevision(repoPath, revision, label, path);
    setBusy(false);
    if (succeeded) {
      setConfirming(false);
    }
  }

  let body;
  if (content.isPending) {
    body = <SkeletonRows count={12} rowHeight={ROW_HEIGHT} />;
  } else if (content.isError) {
    const description = describeError(content.error);
    body = <ErrorState title={description.title} message={description.message} onRetry={() => void content.refetch()} />;
  } else if (!content.data.exists) {
    body = <EmptyState icon={<FileX className="size-5" />} title={t("browse.missing.title")} description={t("browse.missing.description")} />;
  } else if (content.data.imageBase64 !== null) {
    const url = imageDataUrl(path, content.data.imageBase64);
    body = (
      <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-4">
        {url ? <img src={url} alt={path} className="max-h-full max-w-full object-contain" /> : null}
      </div>
    );
  } else if (content.data.binary) {
    body = <EmptyState icon={<FileQuestion className="size-5" />} title={t("browse.binary.title")} description={t("browse.binary.description")} />;
  } else if (content.data.tooLarge || content.data.text === null) {
    body = <EmptyState icon={<FileX className="size-5" />} title={t("browse.tooLarge.title")} description={t("browse.tooLarge.description")} />;
  } else {
    body = (
      <VirtualList
        items={lines}
        rowHeight={ROW_HEIGHT}
        overscan={24}
        innerMinWidth={NUMBER_WIDTH + longest * CHARACTER_WIDTH + 32}
        ariaLabel={t("browse.contentLabel", { path })}
        getKey={(_, index) => index}
        renderRow={(line, index) => <TextLine text={line} number={index + 1} support={support} />}
      />
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={path}>
          {path}
        </span>
        {confirming ? null : (
          <Button size="sm" icon={<RotateCcw className="size-3.5" />} disabled={!content.data?.exists} onClick={() => setConfirming(true)}>
            {t("browse.restore")}
          </Button>
        )}
      </div>
      {confirming ? (
        <div role="alertdialog" aria-label={t("browse.restoreConfirm.title")} className="flex flex-col gap-2 border-b border-line bg-warning/10 px-3 py-2">
          <p className="text-xs">{t("browse.restoreConfirm.description", { path, revision: label })}</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setConfirming(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" variant="primary" loading={busy} onClick={() => void restore()}>
              {t("browse.restoreConfirm.confirm")}
            </Button>
          </div>
        </div>
      ) : null}
      {body}
    </div>
  );
}
