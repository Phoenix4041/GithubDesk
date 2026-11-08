import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { formatRelativeTime } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { IconButton } from "@/shared/ui/icon-button";
import { Skeleton } from "@/shared/ui/skeleton";
import { TextAreaField, TextField } from "@/shared/ui/text-field";
import type { GithubTarget } from "../../target";
import { addKey, dropKey } from "../actions";
import type { DeployKey } from "../api";
import { useDeployKeys } from "../queries";
import { looksLikePublicKey, shortKey } from "../settings-model";
import { QueryError, SectionFrame, ToggleRow } from "./section-frame";

interface Props {
  target: GithubTarget;
  canAdmin: boolean;
}

function NewKeyDialog({ target, onClose }: { target: GithubTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");
  const [readOnly, setReadOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const keyOk = looksLikePublicKey(key);
  const ready = title.trim() !== "" && keyOk;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) {
      return;
    }
    setBusy(true);
    const added = await addKey(target, title.trim(), key.trim(), readOnly);
    setBusy(false);
    if (added) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("github.settings.keys.newTitle")}
      description={t("github.settings.keys.newDescription")}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="new-key-form" disabled={!ready} loading={busy}>
            {t("github.settings.keys.add")}
          </Button>
        </>
      }
    >
      <form id="new-key-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <TextField data-autofocus label={t("github.settings.keys.titleLabel")} value={title} onChange={(event) => setTitle(event.target.value)} />
        <TextAreaField
          label={t("github.settings.keys.keyLabel")}
          hint={t("github.settings.keys.keyHint")}
          error={key.trim() !== "" && !keyOk ? t("github.settings.keys.keyInvalid") : undefined}
          rows={4}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          spellCheck={false}
          placeholder="ssh-ed25519 AAAA..."
        />
        <ToggleRow
          label={t("github.settings.keys.readOnly")}
          hint={t("github.settings.keys.readOnlyHint")}
          checked={readOnly}
          disabled={busy}
          onChange={setReadOnly}
        />
      </form>
    </Dialog>
  );
}

function KeyRow({ target, canAdmin, deployKey }: Props & { deployKey: DeployKey }) {
  const { t, i18n } = useTranslation();
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const created = isoToUnixSeconds(deployKey.createdAt);

  async function remove() {
    setBusy(true);
    await dropKey(target, deployKey.id);
    setBusy(false);
    setRemoving(false);
  }

  return (
    <li className="flex items-center gap-2.5 px-3 py-2.5">
      <KeyRound className="size-4 shrink-0 text-muted" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium">
          {deployKey.title}
          <span className="ml-2 rounded-full bg-subtle px-1.5 py-px text-[10px] font-normal text-muted">
            {deployKey.readOnly ? t("github.settings.keys.readOnlyBadge") : t("github.settings.keys.writeBadge")}
          </span>
        </span>
        <span className="selectable truncate font-mono text-[11px] text-muted">
          {shortKey(deployKey.key)}
          {created > 0 ? ` · ${formatRelativeTime(created, i18n.language)}` : ""}
        </span>
      </div>
      <IconButton label={t("github.settings.keys.remove", { title: deployKey.title })} disabled={!canAdmin} onClick={() => setRemoving(true)}>
        <Trash2 className="size-4" />
      </IconButton>
      <ConfirmDialog
        open={removing}
        title={t("github.settings.keys.removeTitle", { title: deployKey.title })}
        description={t("github.settings.keys.removeDescription")}
        confirmLabel={t("github.settings.keys.removeConfirm")}
        destructive
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(false)}
      />
    </li>
  );
}

export function KeysSection({ target, canAdmin }: Props) {
  const { t } = useTranslation();
  const keys = useDeployKeys(target);
  const [creating, setCreating] = useState(false);

  return (
    <SectionFrame title={t("github.settings.sections.keys")} description={t("github.settings.keys.intro")}>
      <div>
        <Button variant="primary" icon={<Plus className="size-3.5" />} disabled={!canAdmin} onClick={() => setCreating(true)}>
          {t("github.settings.keys.new")}
        </Button>
      </div>
      {keys.isPending ? (
        <Skeleton className="h-20" />
      ) : keys.isError ? (
        <QueryError error={keys.error} onRetry={() => void keys.refetch()} />
      ) : keys.data.length === 0 ? (
        <p className="text-xs text-muted">{t("github.settings.keys.none")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.settings.sections.keys")}>
          {keys.data.map((deployKey) => (
            <KeyRow key={deployKey.id} target={target} canAdmin={canAdmin} deployKey={deployKey} />
          ))}
        </ul>
      )}
      {creating ? <NewKeyDialog target={target} onClose={() => setCreating(false)} /> : null}
    </SectionFrame>
  );
}
