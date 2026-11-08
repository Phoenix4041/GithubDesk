import { Plus, Radio, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { IconButton } from "@/shared/ui/icon-button";
import { Skeleton } from "@/shared/ui/skeleton";
import { TextField } from "@/shared/ui/text-field";
import type { GithubTarget } from "../../target";
import { addHook, dropHook, switchHook, testHook } from "../actions";
import type { Hook } from "../api";
import { useHooks } from "../queries";
import { HOOK_EVENTS, newHookEvents } from "../settings-model";
import { QueryError, SectionFrame, ToggleRow } from "./section-frame";

interface Props {
  target: GithubTarget;
  canAdmin: boolean;
}

function NewHookDialog({ target, onClose }: { target: GithubTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [everything, setEverything] = useState(false);
  const [events, setEvents] = useState<ReadonlySet<string>>(new Set(["push"]));
  const [busy, setBusy] = useState(false);
  const chosen = newHookEvents(events, everything);
  const urlOk = url.trim().startsWith("https://") && url.trim().length > "https://".length;
  const ready = urlOk && chosen.length > 0;

  function toggle(event: string) {
    const next = new Set(events);
    if (next.has(event)) {
      next.delete(event);
    } else {
      next.add(event);
    }
    setEvents(next);
  }

  async function submit(form: FormEvent) {
    form.preventDefault();
    if (!ready || busy) {
      return;
    }
    setBusy(true);
    const created = await addHook(target, { url: url.trim(), events: chosen, secret: secret === "" ? null : secret, active: true });
    setBusy(false);
    if (created) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("github.settings.hooks.newTitle")}
      description={t("github.settings.hooks.newDescription")}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="new-hook-form" disabled={!ready} loading={busy}>
            {t("github.settings.hooks.create")}
          </Button>
        </>
      }
    >
      <form id="new-hook-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <TextField
          data-autofocus
          label={t("github.settings.hooks.url")}
          hint={t("github.settings.hooks.urlHint")}
          value={url}
          placeholder="https://"
          error={url.trim() !== "" && !urlOk ? t("github.settings.hooks.urlInvalid") : undefined}
          onChange={(event) => setUrl(event.target.value)}
          spellCheck={false}
        />
        <TextField
          type="password"
          label={t("github.settings.hooks.secret")}
          hint={t("github.settings.hooks.secretHint")}
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          autoComplete="off"
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium">{t("github.settings.hooks.events")}</legend>
          <ToggleRow label={t("github.settings.hooks.everything")} checked={everything} disabled={busy} onChange={setEverything} />
          <div className="grid grid-cols-2 gap-1.5">
            {HOOK_EVENTS.map((event) => (
              <label key={event} className="flex cursor-pointer items-center gap-2 text-[13px]">
                <Checkbox label={event} checked={everything || events.has(event)} disabled={everything || busy} onChange={() => toggle(event)} />
                <span className="font-mono text-xs">{event}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

function HookRow({ target, canAdmin, hook }: Props & { hook: Hook }) {
  const { t } = useTranslation();
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const code = hook.lastResponse?.code ?? null;
  const healthy = code !== null && code >= 200 && code < 300;

  async function remove() {
    setBusy(true);
    await dropHook(target, hook.id);
    setBusy(false);
    setRemoving(false);
  }

  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[13px]">
          <Checkbox
            label={t("github.settings.hooks.activeFor", { url: hook.config.url })}
            checked={hook.active}
            disabled={!canAdmin}
            onChange={(event) => void switchHook(target, hook.id, event.target.checked)}
          />
          <span className="truncate font-mono text-xs" title={hook.config.url}>
            {hook.config.url}
          </span>
        </label>
        <Button size="sm" icon={<Radio className="size-3.5" />} disabled={!canAdmin} onClick={() => void testHook(target, hook.id)}>
          {t("github.settings.hooks.ping")}
        </Button>
        <IconButton label={t("github.settings.hooks.remove", { url: hook.config.url })} disabled={!canAdmin} onClick={() => setRemoving(true)}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
      <p className="truncate text-[11px] text-muted">
        {hook.events.join(", ")}
        {code !== null ? (
          <span className={healthy ? "text-add" : "text-danger"}> · {t("github.settings.hooks.lastDelivery", { code })}</span>
        ) : (
          ` · ${t("github.settings.hooks.neverDelivered")}`
        )}
      </p>
      <ConfirmDialog
        open={removing}
        title={t("github.settings.hooks.removeTitle")}
        description={t("github.settings.hooks.removeDescription", { url: hook.config.url })}
        confirmLabel={t("github.settings.hooks.removeConfirm")}
        destructive
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(false)}
      />
    </li>
  );
}

export function HooksSection({ target, canAdmin }: Props) {
  const { t } = useTranslation();
  const hooks = useHooks(target);
  const [creating, setCreating] = useState(false);

  return (
    <SectionFrame title={t("github.settings.sections.hooks")} description={t("github.settings.hooks.intro")}>
      <div>
        <Button variant="primary" icon={<Plus className="size-3.5" />} disabled={!canAdmin} onClick={() => setCreating(true)}>
          {t("github.settings.hooks.new")}
        </Button>
      </div>
      {hooks.isPending ? (
        <Skeleton className="h-20" />
      ) : hooks.isError ? (
        <QueryError error={hooks.error} onRetry={() => void hooks.refetch()} />
      ) : hooks.data.length === 0 ? (
        <p className="text-xs text-muted">{t("github.settings.hooks.none")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.settings.sections.hooks")}>
          {hooks.data.map((hook) => (
            <HookRow key={hook.id} target={target} canAdmin={canAdmin} hook={hook} />
          ))}
        </ul>
      )}
      {creating ? <NewHookDialog target={target} onClose={() => setCreating(false)} /> : null}
    </SectionFrame>
  );
}
