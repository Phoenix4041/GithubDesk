import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { describeError } from "@/shared/lib/report-error";
import type { SignatureFormat, SigningConfig, SigningKeys, SigningScope } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { TextField } from "@/shared/ui/text-field";
import { runSigningTest, saveSigningConfig } from "../actions";
import { useSigningConfig, useSigningKeys } from "../queries";
import { useSigningDialogStore } from "../store";

interface FormProps {
  repoPath: string;
  config: SigningConfig;
  keys: SigningKeys;
  onClose: () => void;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex w-fit gap-1 rounded-lg bg-subtle p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-7 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors duration-150",
              option.value === value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SigningForm({ repoPath, config, keys, onClose }: FormProps) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(config.enabled);
  const [format, setFormat] = useState<SignatureFormat>(config.format === "ssh" ? "ssh" : "openpgp");
  const [key, setKey] = useState(config.key ?? "");
  const [allowedSigners, setAllowedSigners] = useState(config.allowedSigners ?? "");
  const [scope, setScope] = useState<SigningScope>(config.scope === "global" ? "global" : "local");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  const savedFormat = config.format === "ssh" ? "ssh" : "openpgp";
  const dirty =
    enabled !== config.enabled ||
    format !== savedFormat ||
    key.trim() !== (config.key ?? "") ||
    allowedSigners.trim() !== (config.allowedSigners ?? "");
  const canTest = config.enabled && !dirty && busy === null;
  const needsKey = enabled && key.trim() === "";

  const detected =
    format === "openpgp"
      ? keys.gpg.map((item) => ({
          value: item.keyId,
          label: `${item.user ?? item.keyId} (${item.keyId.slice(-8)})${item.expired ? ` - ${t("signing.expired")}` : ""}`,
        }))
      : keys.ssh.map((item) => ({ value: item.path, label: `${item.comment ?? item.path} (${item.kind})` }));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy !== null || needsKey) {
      return;
    }
    setBusy("save");
    const succeeded = await saveSigningConfig(repoPath, {
      scope,
      enabled,
      format,
      key: key.trim() || null,
      allowedSigners: format === "ssh" ? allowedSigners.trim() || null : null,
    });
    setBusy(null);
    if (succeeded) {
      onClose();
    }
  }

  async function test() {
    setBusy("test");
    await runSigningTest(repoPath);
    setBusy(null);
  }

  return (
    <Dialog
      open
      title={t("signing.title")}
      description={t("signing.description")}
      onClose={onClose}
      dismissible={busy === null}
      footer={
        <>
          <Button onClick={() => void test()} disabled={!canTest} loading={busy === "test"} title={t("signing.testHint")}>
            {t("signing.test")}
          </Button>
          <Button onClick={onClose} disabled={busy !== null}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="signing-form" disabled={needsKey} loading={busy === "save"}>
            {t("signing.save")}
          </Button>
        </>
      }
    >
      <form id="signing-form" onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="size-3.5 cursor-pointer accent-accent"
          />
          {t("signing.enable")}
        </label>

        <Segmented
          label={t("signing.formatLabel")}
          value={format}
          onChange={(value) => {
            setFormat(value);
            setKey("");
          }}
          options={[
            { value: "openpgp", label: t("signing.formats.openpgp") },
            { value: "ssh", label: t("signing.formats.ssh") },
          ]}
        />

        <div className="flex flex-col gap-2">
          {detected.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signing-detected" className="text-xs font-medium">
                {t("signing.detected")}
              </label>
              <select
                id="signing-detected"
                value={detected.some((item) => item.value === key) ? key : ""}
                onChange={(event) => setKey(event.target.value)}
                className="h-8 cursor-pointer rounded-md border border-line bg-surface px-2 text-[13px] text-fg focus-visible:border-accent focus-visible:outline-none"
              >
                <option value="">{t("signing.chooseKey")}</option>
                {detected.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-xs text-warning">
              {format === "openpgp"
                ? keys.gpgAvailable
                  ? t("signing.noGpgKeys")
                  : t("signing.noGpg")
                : t("signing.noSshKeys")}
            </p>
          )}
          <TextField
            label={t("signing.key")}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            hint={format === "openpgp" ? t("signing.keyHintGpg") : t("signing.keyHintSsh")}
            spellCheck={false}
          />
        </div>

        {format === "ssh" ? (
          <TextField
            label={t("signing.allowedSigners")}
            value={allowedSigners}
            onChange={(event) => setAllowedSigners(event.target.value)}
            hint={t("signing.allowedSignersHint")}
            spellCheck={false}
          />
        ) : null}

        <Segmented
          label={t("signing.scopeLabel")}
          value={scope}
          onChange={setScope}
          options={[
            { value: "local", label: t("signing.scopes.local") },
            { value: "global", label: t("signing.scopes.global") },
          ]}
        />
        {scope === "global" ? <p className="text-xs text-muted">{t("signing.globalNote")}</p> : null}
      </form>
    </Dialog>
  );
}

function SigningLoader({ repoPath, onClose }: { repoPath: string; onClose: () => void }) {
  const { t } = useTranslation();
  const config = useSigningConfig(repoPath);
  const keys = useSigningKeys(repoPath, true);

  if (config.isError || keys.isError) {
    const description = describeError(config.error ?? keys.error);
    return (
      <Dialog open title={t("signing.title")} onClose={onClose}>
        <ErrorState title={description.title} message={description.message} onRetry={() => void config.refetch()} />
      </Dialog>
    );
  }
  if (!config.data || !keys.data) {
    return (
      <Dialog open title={t("signing.title")} description={t("signing.description")} onClose={onClose}>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      </Dialog>
    );
  }
  return <SigningForm repoPath={repoPath} config={config.data} keys={keys.data} onClose={onClose} />;
}

export function SigningDialog({ repoPath }: { repoPath: string }) {
  const open = useSigningDialogStore((state) => state.open);
  const hide = useSigningDialogStore((state) => state.hide);
  return open ? <SigningLoader repoPath={repoPath} onClose={hide} /> : null;
}
