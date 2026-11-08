import { Check, ExternalLink, Minus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGrantScopesStore } from "@/shared/lib/grant-scopes-store";
import { openExternal } from "@/shared/lib/external";
import { formatDateTime, formatRelativeTime } from "@/shared/lib/format";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { describeError } from "@/shared/lib/report-error";
import type { CapabilityStatus, GithubAccount } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { authorizedAppsUrl, daysUntil, tokensPageUrl } from "../capability-model";
import { useTokenInfo } from "../queries";

const EXPIRY_WARNING_DAYS = 7;

function StatusIcon({ granted }: { granted: boolean | null }) {
  if (granted === true) {
    return <Check className="size-3.5 text-add" aria-hidden="true" />;
  }
  if (granted === false) {
    return <X className="size-3.5 text-danger" aria-hidden="true" />;
  }
  return <Minus className="size-3.5 text-muted" aria-hidden="true" />;
}

function CapabilityRow({ capability, account }: { capability: CapabilityStatus; account: GithubAccount }) {
  const { t } = useTranslation();
  const show = useGrantScopesStore((state) => state.show);
  const name = t(`github.scopes.capabilities.${capability.id}.name`);
  return (
    <li className="flex items-center gap-2 text-xs">
      <StatusIcon granted={capability.granted} />
      <span className="flex-1">{name}</span>
      {capability.granted === false ? (
        <Button size="sm" onClick={() => show({ accountId: account.id, capabilityIds: [capability.id] })}>
          {t("github.scopes.grantOne", { name })}
        </Button>
      ) : null}
    </li>
  );
}

export function TokenDetails({ account }: { account: GithubAccount }) {
  const { t, i18n } = useTranslation();
  const info = useTokenInfo(account.id);
  const show = useGrantScopesStore((state) => state.show);

  if (info.isPending) {
    return <Skeleton className="h-24" />;
  }
  if (info.isError) {
    return <p className="text-xs text-danger">{describeError(info.error).message}</p>;
  }
  const data = info.data;
  const days = daysUntil(data.expiresAt);
  const expiry = isoToUnixSeconds(data.expiresAt);

  return (
    <div className="flex flex-col gap-3" aria-label={t("github.scopes.detailsLabel", { login: account.login })}>
      {data.scopes === null ? (
        <p className="text-xs text-muted">{t("github.scopes.hiddenToken")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {data.capabilities.map((capability) => (
            <CapabilityRow key={capability.id} capability={capability} account={account} />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        {expiry > 0
          ? t("github.scopes.expires", { date: formatDateTime(expiry, i18n.language), relative: formatRelativeTime(expiry, i18n.language) })
          : t("github.scopes.noExpiry")}
      </p>
      {days !== null && days <= EXPIRY_WARNING_DAYS ? (
        <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning" role="status">
          {days > 0 ? t("github.scopes.expiresSoon", { count: days }) : t("github.scopes.expired")}
        </p>
      ) : null}
      {data.rateLimit ? (
        <p className="text-xs text-muted">
          {t("github.scopes.rateLimit", {
            remaining: data.rateLimit.remaining,
            limit: data.rateLimit.limit,
            time: new Date(data.rateLimit.resetAt * 1000).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }),
          })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => show({ accountId: account.id })}>
          {t("github.scopes.moreAccess")}
        </Button>
        <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => void openExternal(tokensPageUrl(account.host))}>
          {t("github.scopes.openTokens")}
        </Button>
        <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => void openExternal(authorizedAppsUrl(account.host))}>
          {t("github.scopes.revokeOnGithub")}
        </Button>
      </div>
      <p className="text-[11px] text-muted">{t("github.scopes.revokeNote")}</p>
    </div>
  );
}
