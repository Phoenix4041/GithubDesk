import { ChevronDown, ChevronRight, Plus, Trash2, UserCog } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { IconButton } from "@/shared/ui/icon-button";
import type { GithubAccount } from "@/shared/types/git";
import { disconnectAccount } from "../actions";
import { AccountDialog } from "../account/components/account-dialog";
import { TokenDetails } from "../scopes/components/token-details";
import { useAccounts } from "../queries";
import { AddAccountDialog } from "./add-account-dialog";

export function AccountsSection() {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<GithubAccount | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [managing, setManaging] = useState<GithubAccount | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmRemoval() {
    if (!removing) {
      return;
    }
    setBusy(true);
    await disconnectAccount(removing);
    setBusy(false);
    setRemoving(null);
  }

  return (
    <section className="flex flex-col gap-2" aria-label={t("github.accounts.title")}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium">{t("github.accounts.title")}</h3>
        <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
          {t("github.accounts.add")}
        </Button>
      </div>
      {accounts.data && accounts.data.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {accounts.data.map((account) => (
            <li key={account.id} className="flex flex-col gap-2.5 rounded-lg border border-line px-2.5 py-2">
              <div className="flex items-center gap-2.5">
                <Avatar url={account.avatarUrl} name={account.login} size={28} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium">{account.name ?? account.login}</span>
                  <span className="truncate text-[11px] text-muted">
                    {account.login} &middot; {account.host} &middot; {t(`github.accounts.source.${account.source}`)}
                  </span>
                </div>
                <IconButton
                  label={t("github.scopes.toggle", { login: account.login })}
                  active={expandedId === account.id}
                  onClick={() => setExpandedId(expandedId === account.id ? null : account.id)}
                >
                  {expandedId === account.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </IconButton>
                <IconButton label={t("github.account.manage", { login: account.login })} onClick={() => setManaging(account)}>
                  <UserCog className="size-4" />
                </IconButton>
                <IconButton label={t("github.accounts.remove", { login: account.login })} onClick={() => setRemoving(account)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
              {expandedId === account.id ? <TokenDetails account={account} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">{t("github.accounts.empty")}</p>
      )}
      <AddAccountDialog open={adding} onClose={() => setAdding(false)} />
      {managing ? <AccountDialog account={managing} onClose={() => setManaging(null)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        title={t("github.accounts.removeDialog.title", { login: removing?.login ?? "" })}
        description={t("github.accounts.removeDialog.description")}
        confirmLabel={t("github.accounts.removeDialog.confirm")}
        destructive
        loading={busy}
        onConfirm={() => void confirmRemoval()}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}
