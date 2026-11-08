import { ExternalLink, Paperclip, Pencil, Plus, Rocket, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { openExternal } from "@/shared/lib/external";
import { formatRelativeTime } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { IconButton } from "@/shared/ui/icon-button";
import { Markdown } from "@/shared/ui/markdown";
import { Skeleton } from "@/shared/ui/skeleton";
import { GithubGate, useGithubTarget } from "../../components/github-gate";
import { QueryError } from "../../settings/components/section-frame";
import type { GithubTarget } from "../../target";
import { attachFiles, editRelease, removeAsset, removeRelease } from "../actions";
import { useReleases } from "../queries";
import { formatBytes, releaseStatus, releaseTitle } from "../releases-model";
import type { Release } from "../releases-model";
import { useReleaseStore } from "../store";
import { ReleaseDialog } from "./release-dialog";

function ReleaseList({ target, repoPath }: { target: GithubTarget; repoPath: string }) {
  const { t, i18n } = useTranslation();
  const releases = useReleases(target);
  const selected = useReleaseStore((state) => state.selected);
  const select = useReleaseStore((state) => state.select);
  const creating = useReleaseStore((state) => state.creating);
  const startCreating = useReleaseStore((state) => state.startCreating);
  const stopCreating = useReleaseStore((state) => state.stopCreating);
  const items = releases.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-line p-2">
        <h2 className="px-1 text-xs font-semibold">{t("github.releases.title_plural")}</h2>
        <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={startCreating}>
          {t("github.releases.new")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {releases.isPending ? (
          <Skeleton className="m-3 h-24" />
        ) : releases.isError ? (
          <div className="p-3">
            <QueryError error={releases.error} onRetry={() => void releases.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Rocket className="size-5" />} title={t("github.releases.empty.title")} description={t("github.releases.empty.description")} />
        ) : (
          <ul aria-label={t("github.releases.listLabel")}>
            {items.map((release) => {
              const status = releaseStatus(release);
              const when = isoToUnixSeconds(release.publishedAt ?? release.createdAt);
              return (
                <li key={release.id}>
                  <button
                    type="button"
                    aria-current={selected === release.id ? "true" : undefined}
                    onClick={() => select(release.id)}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-0.5 border-b border-line px-3 py-2 text-left hover:bg-subtle",
                      selected === release.id && "bg-accent-soft",
                    )}
                  >
                    <span className="flex items-center gap-2 text-[13px] font-medium">
                      <span className="truncate">{releaseTitle(release)}</span>
                      {status !== "published" ? (
                        <span className="shrink-0 rounded-full bg-subtle px-1.5 py-px text-[10px] font-normal text-muted">
                          {t(`github.releases.status.${status}`)}
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-[11px] text-muted">
                      {release.tagName}
                      {when > 0 ? ` · ${formatRelativeTime(when, i18n.language)}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {releases.hasNextPage ? (
          <div className="p-3">
            <Button size="sm" loading={releases.isFetchingNextPage} onClick={() => void releases.fetchNextPage()}>
              {t("github.home.loadMore")}
            </Button>
          </div>
        ) : null}
      </div>
      {creating ? <ReleaseDialog target={target} repoPath={repoPath} release={null} onClose={stopCreating} /> : null}
    </div>
  );
}

export function ReleasesPanel({ repoPath }: { repoPath: string }) {
  return <GithubGate repoPath={repoPath}>{(target) => <ReleaseList target={target} repoPath={repoPath} />}</GithubGate>;
}

function Detail({ target, repoPath, release }: { target: GithubTarget; repoPath: string; release: Release }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState<"publish" | "attach" | "delete" | null>(null);
  const status = releaseStatus(release);

  async function publish() {
    setBusy("publish");
    await editRelease(target, release.id, { draft: false });
    setBusy(null);
  }

  async function attach() {
    setBusy("attach");
    await attachFiles(target, release.id);
    setBusy(null);
  }

  async function remove() {
    setBusy("delete");
    await removeRelease(target, release.id);
    setBusy(null);
    setRemoving(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex flex-col gap-2 border-b border-line px-5 py-3">
        <h2 className="text-[15px] leading-snug font-semibold">{releaseTitle(release)}</h2>
        <p className="text-xs text-muted">
          <span className="font-mono">{release.tagName}</span>
          {status !== "published" ? ` · ${t(`github.releases.status.${status}`)}` : ""}
          {release.author ? ` · ${release.author.login}` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {status === "draft" ? (
            <Button size="sm" variant="primary" icon={<Rocket className="size-3.5" />} loading={busy === "publish"} onClick={() => void publish()}>
              {t("github.releases.publishDraft")}
            </Button>
          ) : null}
          <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
            {t("github.collab.edit")}
          </Button>
          <Button size="sm" icon={<Paperclip className="size-3.5" />} loading={busy === "attach"} onClick={() => void attach()}>
            {t("github.releases.attach")}
          </Button>
          <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => void openExternal(release.htmlUrl)}>
            {t("github.openOnGithub")}
          </Button>
          <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => setRemoving(true)}>
            {t("github.releases.delete")}
          </Button>
        </div>
      </header>
      <div className="flex flex-col gap-5 p-5">
        {release.body?.trim() ? <Markdown source={release.body} /> : <p className="text-xs text-muted">{t("github.releases.noNotes")}</p>}
        <section className="flex flex-col gap-1.5" aria-label={t("github.releases.assets")}>
          <h3 className="text-xs font-semibold">
            {t("github.releases.assets")} ({release.assets.length})
          </h3>
          {release.assets.length === 0 ? (
            <p className="text-xs text-muted">{t("github.releases.noAssets")}</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {release.assets.map((asset) => (
                <li key={asset.id} className="flex items-center gap-2.5 px-3 py-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer truncate text-left font-mono text-xs hover:underline"
                    onClick={() => void openExternal(asset.browserDownloadUrl)}
                  >
                    {asset.name}
                  </button>
                  <span className="shrink-0 text-[11px] text-muted">
                    {formatBytes(asset.size)} · {t("github.releases.downloads", { count: asset.downloadCount })}
                  </span>
                  <IconButton label={t("github.releases.deleteAsset", { name: asset.name })} onClick={() => void removeAsset(target, asset.id)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {editing ? <ReleaseDialog target={target} repoPath={repoPath} release={release} onClose={() => setEditing(false)} /> : null}
      <ConfirmDialog
        open={removing}
        title={t("github.releases.deleteTitle", { tag: release.tagName })}
        description={t("github.releases.deleteDescription")}
        confirmLabel={t("github.releases.delete")}
        destructive
        loading={busy === "delete"}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(false)}
      />
    </div>
  );
}

export function ReleaseDetailPanel({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const { target } = useGithubTarget(repoPath);
  const selected = useReleaseStore((state) => state.selected);
  if (!target) {
    return null;
  }
  return <DetailLoader target={target} repoPath={repoPath} selected={selected} emptyTitle={t("github.releases.nothingSelected")} />;
}

function DetailLoader({
  target,
  repoPath,
  selected,
  emptyTitle,
}: {
  target: GithubTarget;
  repoPath: string;
  selected: number | null;
  emptyTitle: string;
}) {
  const releases = useReleases(target);
  const release = releases.data?.pages.flatMap((page) => page.items).find((item) => item.id === selected);
  if (!release) {
    return <EmptyState icon={<Rocket className="size-5" />} title={emptyTitle} />;
  }
  return <Detail target={target} repoPath={repoPath} release={release} />;
}
