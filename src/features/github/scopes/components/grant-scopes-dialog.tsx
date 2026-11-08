import { Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/features/settings/store";
import { openExternal } from "@/shared/lib/external";
import { useGrantScopesStore } from "@/shared/lib/grant-scopes-store";
import type { GrantRequest } from "@/shared/lib/grant-scopes-store";
import { queryClient } from "@/shared/lib/query-client";
import { describeError } from "@/shared/lib/report-error";
import type { GithubAccount, TokenInfo } from "@/shared/types/git";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog } from "@/shared/ui/dialog";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";
import { TextField } from "@/shared/ui/text-field";
import { showToast } from "@/shared/ui/toast-store";
import { i18next } from "@/i18n";
import { connectWithToken } from "../../actions";
import { useAccounts } from "../../queries";
import { useDeviceFlow } from "../../use-device-flow";
import { missingCapabilities, preselectedCapabilities, scopesToRequest, tokenCreationUrl, tokensPageUrl } from "../capability-model";
import { tokenInfoKeys, useTokenInfo } from "../queries";

interface FormProps {
  request: GrantRequest;
  onClose: () => void;
}

function announceUpdated(login: string): void {
  showToast({ kind: "success", title: i18next.t("github.scopes.updated", { login }) });
}

function CapabilityChoices({
  info,
  selected,
  onToggle,
  disabled,
}: {
  info: TokenInfo;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const missing = missingCapabilities(info);
  if (missing.length === 0) {
    return <p className="rounded-md bg-subtle px-3 py-2 text-xs text-muted">{t("github.scopes.nothingMissing")}</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5" aria-label={t("github.scopes.choicesLabel")}>
      {missing.map((capability) => (
        <li key={capability.id} className="flex items-start gap-2.5 rounded-md border border-line px-3 py-2">
          <Checkbox
            label={t(`github.scopes.capabilities.${capability.id}.name`)}
            checked={selected.has(capability.id)}
            disabled={disabled}
            onChange={() => onToggle(capability.id)}
            className="mt-0.5"
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-medium">{t(`github.scopes.capabilities.${capability.id}.name`)}</span>
            <span className="text-xs text-muted">{t(`github.scopes.capabilities.${capability.id}.description`)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function GrantForm({ request, onClose }: FormProps) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const clientId = useSettingsStore((state) => state.githubClientId);
  const setClientId = useSettingsStore((state) => state.setGithubClientId);
  const [chosenId, setChosenId] = useState<string | null>(request.accountId);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [pastedToken, setPastedToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const device = useDeviceFlow();

  const list: GithubAccount[] = accounts.data ?? [];
  const account = list.find((item) => item.id === chosenId) ?? list[0] ?? null;
  const info = useTokenInfo(account?.id ?? null);
  const data = info.data;
  const selected = picked ?? (data ? preselectedCapabilities(data, request.scopes, request.capabilityIds) : new Set<string>());
  const busy = device.busy || savingToken;
  const requested = data ? scopesToRequest(data, selected) : [];
  const hiddenScopes = data !== undefined && data.scopes === null;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setPicked(next);
  }

  function close() {
    device.cancel();
    onClose();
  }

  async function refreshAndClose(login: string) {
    await queryClient.invalidateQueries({ queryKey: tokenInfoKeys.all });
    announceUpdated(login);
    onClose();
  }

  async function startBrowserFlow(event: FormEvent) {
    event.preventDefault();
    if (!account || busy || selected.size === 0 || clientId.trim().length === 0) {
      return;
    }
    const updated = await device.start(account.host, clientId.trim(), {
      scopes: requested,
      expectedLogin: account.login,
    });
    if (updated) {
      await refreshAndClose(updated.login);
    }
  }

  async function saveToken(event: FormEvent) {
    event.preventDefault();
    if (!account || busy || pastedToken.trim().length === 0) {
      return;
    }
    setSavingToken(true);
    const saved = await connectWithToken(account.host, pastedToken.trim());
    setSavingToken(false);
    if (saved) {
      setPastedToken("");
      await refreshAndClose(saved.login);
    }
  }

  let body;
  if (accounts.isPending || (account && info.isPending)) {
    body = <Skeleton className="h-32" />;
  } else if (!account) {
    body = <p className="text-xs text-muted">{t("github.accounts.empty")}</p>;
  } else if (info.isError) {
    const description = describeError(info.error);
    body = <ErrorState title={description.title} message={description.message} onRetry={() => void info.refetch()} />;
  } else if (!data) {
    body = null;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {list.length > 1 ? (
          <div role="radiogroup" aria-label={t("github.scopes.accountLabel")} className="flex flex-col gap-1.5">
            {list.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={item.id === account.id}
                disabled={busy}
                onClick={() => {
                  setChosenId(item.id);
                  setPicked(null);
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line px-3 py-2 text-left aria-checked:border-accent aria-checked:bg-accent-soft disabled:cursor-not-allowed"
              >
                <Avatar url={item.avatarUrl} name={item.login} size={22} />
                <span className="text-[13px] font-medium">{item.login}</span>
                <span className="text-xs text-muted">{item.host}</span>
              </button>
            ))}
          </div>
        ) : null}

        {hiddenScopes ? (
          <div className="flex flex-col gap-2 rounded-md bg-warning/15 px-3 py-2 text-xs text-warning" role="status">
            <p>{t("github.scopes.hiddenToken")}</p>
            <div>
              <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => void openExternal(tokensPageUrl(account.host))}>
                {t("github.scopes.openTokens")}
              </Button>
            </div>
          </div>
        ) : (
          <CapabilityChoices info={data} selected={selected} onToggle={toggle} disabled={busy} />
        )}

        {hiddenScopes ? null : account.source === "oauth" ? (
          device.code ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-canvas p-4 text-center" role="status">
              <p className="text-xs text-muted">{t("github.add.codeInstruction")}</p>
              <p className="selectable font-mono text-2xl font-semibold tracking-[0.2em]">{device.code.userCode}</p>
              <div className="flex gap-2">
                <Button size="sm" icon={<Copy className="size-3.5" />} onClick={() => void navigator.clipboard.writeText(device.code?.userCode ?? "")}>
                  {t("github.add.copyCode")}
                </Button>
                <Button
                  size="sm"
                  icon={<ExternalLink className="size-3.5" />}
                  onClick={() => void openExternal(device.code?.verificationUri ?? "")}
                >
                  {t("github.add.openGithub")}
                </Button>
              </div>
              <p className="flex items-center gap-2 text-xs text-muted">
                <Spinner />
                {t("github.add.waiting")}
              </p>
            </div>
          ) : (
            <form onSubmit={(event) => void startBrowserFlow(event)} className="flex flex-col gap-3">
              {clientId.trim().length === 0 ? (
                <TextField
                  label={t("github.add.clientId")}
                  hint={t("github.add.clientIdHint")}
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
              ) : null}
              <div>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={selected.size === 0 || clientId.trim().length === 0}
                  loading={device.busy}
                >
                  {t("github.scopes.grant")}
                </Button>
              </div>
            </form>
          )
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted">{t("github.scopes.tokenSteps")}</p>
            <div>
              <Button
                size="sm"
                icon={<ExternalLink className="size-3.5" />}
                disabled={selected.size === 0}
                onClick={() => void openExternal(tokenCreationUrl(account.host, requested))}
              >
                {t("github.scopes.createToken")}
              </Button>
            </div>
            <form onSubmit={(event) => void saveToken(event)} className="flex flex-col gap-3">
              <TextField
                type="password"
                label={t("github.scopes.newToken")}
                hint={t("github.scopes.newTokenHint", { login: account.login })}
                value={pastedToken}
                disabled={busy}
                onChange={(event) => setPastedToken(event.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <div>
                <Button type="submit" variant="primary" disabled={pastedToken.trim().length === 0} loading={savingToken}>
                  {t("github.scopes.replaceToken")}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <Dialog
      open
      title={t("github.scopes.title")}
      description={t("github.scopes.description")}
      onClose={close}
      width="md"
      footer={<Button onClick={close}>{device.code ? t("common.cancel") : t("common.close")}</Button>}
    >
      {body}
    </Dialog>
  );
}

export function GrantScopesDialog() {
  const request = useGrantScopesStore((state) => state.request);
  const hide = useGrantScopesStore((state) => state.hide);
  if (!request) {
    return null;
  }
  return <GrantForm request={request} onClose={hide} />;
}
