import { useTranslation } from "react-i18next";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { formatRelativeTime } from "@/shared/lib/format";
import { Avatar } from "@/shared/ui/avatar";
import { Markdown } from "@/shared/ui/markdown";
import type { UserRef } from "../types";

interface TimelineEntryProps {
  user: UserRef | null;
  createdAt: string | null;
  headline?: string;
  body: string | null;
}

export function TimelineEntry({ user, createdAt, headline, body }: TimelineEntryProps) {
  const { t, i18n } = useTranslation();
  const login = user?.login ?? t("github.ghost");
  return (
    <article className="flex gap-3">
      <Avatar url={user?.avatarUrl} name={login} size={28} className="mt-0.5" />
      <div className="min-w-0 flex-1 rounded-lg border border-line">
        <header className="flex flex-wrap items-baseline gap-x-1.5 border-b border-line bg-canvas px-3 py-1.5 text-xs">
          <span className="font-semibold">{login}</span>
          {headline ? <span className="text-muted">{headline}</span> : null}
          {createdAt ? (
            <span className="text-muted">&middot; {formatRelativeTime(isoToUnixSeconds(createdAt), i18n.language)}</span>
          ) : null}
        </header>
        <div className="px-3 py-2.5">
          {body && body.trim().length > 0 ? (
            <Markdown source={body} />
          ) : (
            <p className="text-xs text-muted italic">{t("github.noDescription")}</p>
          )}
        </div>
      </div>
    </article>
  );
}

export function LabelChips({ labels }: { labels: Array<{ name: string; color: string }> }) {
  if (labels.length === 0) {
    return null;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label.name}
          className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-px text-[11px]"
        >
          <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: `#${label.color}` }} />
          {label.name}
        </span>
      ))}
    </span>
  );
}
