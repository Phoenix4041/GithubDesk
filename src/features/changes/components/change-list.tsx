import { Archive, Trash2 } from "lucide-react";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStashDialogStore } from "@/features/stash/store";
import { cn } from "@/shared/lib/cn";
import { splitPath } from "@/shared/lib/paths";
import type { StatusEntry } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { IconButton } from "@/shared/ui/icon-button";
import { VirtualList } from "@/shared/ui/virtual-list";
import { discardFiles, stageFiles, unstageFiles } from "../actions";
import { effectiveChange } from "../change-model";
import type { ChangeModel, ChangeRow, ChangeSection } from "../change-model";
import { useChangesStore } from "../store";
import { ChangeKindBadge } from "./change-badge";

const ROW_HEIGHT = 32;

interface FileRowProps {
  repoPath: string;
  section: ChangeSection;
  entry: StatusEntry;
  selected: boolean;
  onRequestDiscard: (entries: StatusEntry[]) => void;
}

const FileRow = memo(function FileRow({ repoPath, section, entry, selected, onRequestDiscard }: FileRowProps) {
  const { t } = useTranslation();
  const select = useChangesStore((state) => state.select);
  const { directory, fileName } = splitPath(entry.path);
  const kind = effectiveChange(section, entry);

  function toggleStage() {
    if (section === "staged") {
      void unstageFiles(repoPath, [entry.path]);
    } else {
      void stageFiles(repoPath, [entry.path]);
    }
  }

  const checkboxLabel =
    section === "staged"
      ? t("changes.unstageFile", { path: entry.path })
      : section === "conflicts"
        ? t("changes.markResolved", { path: entry.path })
        : t("changes.stageFile", { path: entry.path });

  return (
    <div
      className={cn(
        "group mx-1.5 flex h-[calc(100%-2px)] items-center gap-2 rounded-md pr-1 pl-2 transition-colors duration-150",
        selected ? "bg-accent-soft" : "hover:bg-subtle",
      )}
    >
      <Checkbox label={checkboxLabel} checked={section === "staged"} onChange={toggleStage} />
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={() => select({ section, path: entry.path })}
        title={entry.originalPath ? `${entry.originalPath} -> ${entry.path}` : entry.path}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-left"
      >
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="shrink-0 text-[13px] font-medium">{fileName}</span>
          <span className="truncate text-[11px] text-muted" dir="rtl">
            <bdi>{directory}</bdi>
          </span>
        </span>
        <ChangeKindBadge kind={kind} label={t(`changes.kind.${kind}`)} />
      </button>
      {section === "unstaged" ? (
        <IconButton
          label={t("changes.discardFile", { path: entry.path })}
          onClick={() => onRequestDiscard([entry])}
          className="size-6 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </IconButton>
      ) : null}
    </div>
  );
});

interface ChangeListProps {
  repoPath: string;
  model: ChangeModel;
}

export function ChangeList({ repoPath, model }: ChangeListProps) {
  const { t } = useTranslation();
  const selected = useChangesStore((state) => state.selected);
  const showStashDialog = useStashDialogStore((state) => state.show);
  const [pendingDiscard, setPendingDiscard] = useState<StatusEntry[] | null>(null);
  const [discarding, setDiscarding] = useState(false);

  async function confirmDiscard() {
    if (!pendingDiscard) {
      return;
    }
    setDiscarding(true);
    await discardFiles(repoPath, pendingDiscard);
    setDiscarding(false);
    setPendingDiscard(null);
  }

  function renderSection(row: Extract<ChangeRow, { kind: "section" }>) {
    return (
      <div className="flex h-full items-center justify-between gap-2 px-3 pt-1">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
          {t(`changes.sections.${row.section}`)}
          <span className="rounded-full bg-subtle px-1.5 py-px text-[10px] tabular-nums">{row.count}</span>
        </h3>
        <div className="flex items-center gap-1">
          {row.section === "staged" ? (
            <Button size="sm" variant="ghost" onClick={() => void unstageFiles(repoPath, model.staged.map((entry) => entry.path))}>
              {t("changes.unstageAll")}
            </Button>
          ) : null}
          {row.section === "unstaged" ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => void stageFiles(repoPath, model.unstaged.map((entry) => entry.path))}>
                {t("changes.stageAll")}
              </Button>
              <IconButton label={t("changes.stashAll")} onClick={() => showStashDialog({ kind: "save" })} className="size-6">
                <Archive className="size-3.5" />
              </IconButton>
              <IconButton label={t("changes.discardAll")} onClick={() => setPendingDiscard(model.unstaged)} className="size-6">
                <Trash2 className="size-3.5" />
              </IconButton>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  const untrackedCount = pendingDiscard?.filter((entry) => entry.untracked).length ?? 0;
  const trackedCount = (pendingDiscard?.length ?? 0) - untrackedCount;
  const consequences: string[] = [];
  if (trackedCount > 0) {
    consequences.push(t("changes.discard.lossTracked", { count: trackedCount }));
  }
  if (untrackedCount > 0) {
    consequences.push(t("changes.discard.lossUntracked", { count: untrackedCount }));
  }
  consequences.push(t("changes.discard.noUndo"));

  return (
    <>
      <VirtualList
        items={model.rows}
        rowHeight={ROW_HEIGHT}
        ariaLabel={t("changes.listLabel")}
        getKey={(row) => (row.kind === "section" ? `section:${row.section}` : `${row.section}:${row.entry.path}`)}
        renderRow={(row) =>
          row.kind === "section" ? (
            renderSection(row)
          ) : (
            <FileRow
              repoPath={repoPath}
              section={row.section}
              entry={row.entry}
              selected={selected?.section === row.section && selected.path === row.entry.path}
              onRequestDiscard={setPendingDiscard}
            />
          )
        }
      />
      <ConfirmDialog
        open={pendingDiscard !== null}
        title={t("changes.discard.title", { count: pendingDiscard?.length ?? 0 })}
        description={
          pendingDiscard?.length === 1 && pendingDiscard[0]
            ? t("changes.discard.descriptionOne", { path: pendingDiscard[0].path })
            : t("changes.discard.descriptionMany", { count: pendingDiscard?.length ?? 0 })
        }
        consequences={consequences}
        confirmLabel={t("changes.discard.confirm")}
        destructive
        loading={discarding}
        onConfirm={() => void confirmDiscard()}
        onCancel={() => setPendingDiscard(null)}
      />
    </>
  );
}
