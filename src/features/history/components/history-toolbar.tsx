import { GitFork, ListFilter, List } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { SearchInput } from "@/shared/ui/search-input";
import { TextField } from "@/shared/ui/text-field";
import { useHistoryFilterStore } from "../filter-store";
import { isFiltering } from "../history-query";
import type { HistoryFilterFields } from "../history-query";

interface HistoryToolbarProps {
  fields: HistoryFilterFields;
}

export function HistoryToolbar({ fields }: HistoryToolbarProps) {
  const { t } = useTranslation();
  const graph = useHistoryFilterStore((state) => state.graph);
  const panelOpen = useHistoryFilterStore((state) => state.panelOpen);
  const patch = useHistoryFilterStore((state) => state.patch);
  const clear = useHistoryFilterStore((state) => state.clear);
  const setGraph = useHistoryFilterStore((state) => state.setGraph);
  const setPanelOpen = useHistoryFilterStore((state) => state.setPanelOpen);
  const filtering = isFiltering(fields);

  return (
    <div className="flex flex-col gap-2 border-b border-line px-3 py-2">
      <div className="flex items-center gap-1.5">
        <SearchInput
          label={t("history.search.text")}
          value={fields.text}
          onValueChange={(text) => patch({ text })}
          className="min-w-0 flex-1"
        />
        <IconButton
          label={t("history.search.filters")}
          active={panelOpen || (filtering && fields.text.trim() === "")}
          aria-pressed={panelOpen}
          onClick={() => setPanelOpen(!panelOpen)}
        >
          <ListFilter className="size-4" />
        </IconButton>
        <div role="group" aria-label={t("history.view.label")} className="flex items-center">
          <IconButton
            label={t("history.view.list")}
            active={!graph}
            aria-pressed={!graph}
            onClick={() => setGraph(false)}
          >
            <List className="size-4" />
          </IconButton>
          <IconButton
            label={filtering ? t("history.view.graphDisabled") : t("history.view.graph")}
            active={graph}
            aria-pressed={graph}
            onClick={() => setGraph(true)}
          >
            <GitFork className="size-4" />
          </IconButton>
        </div>
      </div>
      {panelOpen ? (
        <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-canvas p-3">
          <div className="grid grid-cols-2 gap-2.5">
            <TextField
              label={t("history.search.author")}
              value={fields.author}
              onChange={(event) => patch({ author: event.target.value })}
              spellCheck={false}
            />
            <TextField
              label={t("history.search.path")}
              value={fields.path}
              onChange={(event) => patch({ path: event.target.value })}
              spellCheck={false}
            />
          </div>
          <TextField
            label={t("history.search.content")}
            hint={t("history.search.contentHint")}
            value={fields.content}
            onChange={(event) => patch({ content: event.target.value })}
            spellCheck={false}
          />
          <div className="grid grid-cols-2 gap-2.5">
            <TextField
              type="date"
              label={t("history.search.since")}
              value={fields.since}
              onChange={(event) => patch({ since: event.target.value })}
            />
            <TextField
              type="date"
              label={t("history.search.until")}
              value={fields.until}
              onChange={(event) => patch({ until: event.target.value })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={fields.contentRegex}
                onChange={(event) => patch({ contentRegex: event.target.checked })}
                className="size-3.5 cursor-pointer accent-accent"
              />
              {t("history.search.regex")}
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={fields.scope === "all"}
                onChange={(event) => patch({ scope: event.target.checked ? "all" : "current" })}
                className="size-3.5 cursor-pointer accent-accent"
              />
              {t("history.search.allBranches")}
            </label>
            <label className={cn("flex items-center gap-2", fields.path.trim() ? "cursor-pointer" : "opacity-50")}>
              <input
                type="checkbox"
                checked={fields.follow}
                disabled={fields.path.trim() === ""}
                onChange={(event) => patch({ follow: event.target.checked })}
                className="size-3.5 cursor-pointer accent-accent disabled:cursor-not-allowed"
              />
              {t("history.search.follow")}
            </label>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" disabled={!filtering && fields.scope === "current"} onClick={clear}>
              {t("history.search.clear")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
