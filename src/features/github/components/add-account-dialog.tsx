import { Copy, ExternalLink } from "lucide-react";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/cn";
import { openExternal } from "@/shared/lib/external";
import { reportError } from "@/shared/lib/report-error";
import type { DeviceCode } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { Spinner } from "@/shared/ui/spinner";
import { TextField } from "@/shared/ui/text-field";
import { cancelDeviceFlow, completeDeviceFlow, connectWithToken } from "../actions";
import { startDeviceFlow } from "../api";

type Method = "browser" | "token";

interface AddAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_HOST = "github.com";

export function AddAccountDialog({ open, onClose }: AddAccountDialogProps) {
  const { t } = useTranslation();
  const clientId = useSettingsStore((state) => state.githubClientId);
  const setClientId = useSettingsStore((state) => state.setGithubClientId);
  const [method, setMethod] = useState<Method>("browser");
  const [host, setHost] = useState(DEFAULT_HOST);
  const [token, setToken] = useState("");
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [busy, setBusy] = useState(false);
  const jobId = useRef<string | null>(null);

  function reset() {
    setCode(null);
    setToken("");
    setBusy(false);
    jobId.current = null;
  }

  function close() {
    if (jobId.current) {
      cancelDeviceFlow(jobId.current);
    }
    reset();
    onClose();
  }

  async function startBrowserFlow(event: FormEvent) {
    event.preventDefault();
    if (busy || clientId.trim().length === 0) {
      return;
    }
    setBusy(true);
    try {
      const device = await startDeviceFlow(host.trim(), clientId.trim());
      setCode(device);
      const currentJob = crypto.randomUUID();
      jobId.current = currentJob;
      void openExternal(device.verificationUri);
      const account = await completeDeviceFlow(host.trim(), clientId.trim(), device, currentJob);
      if (jobId.current === currentJob) {
        jobId.current = null;
        setCode(null);
        setBusy(false);
        if (account) {
          onClose();
        }
      }
    } catch (error) {
      reportError(error);
      reset();
    }
  }

  async function submitToken(event: FormEvent) {
    event.preventDefault();
    if (busy || token.trim().length === 0) {
      return;
    }
    setBusy(true);
    const account = await connectWithToken(host.trim(), token.trim());
    setBusy(false);
    if (account) {
      reset();
      onClose();
    }
  }

  const methods: Array<{ id: Method; label: string }> = [
    { id: "browser", label: t("github.add.methods.browser") },
    { id: "token", label: t("github.add.methods.token") },
  ];

  return (
    <Dialog
      open={open}
      title={t("github.add.title")}
      description={t("github.add.description")}
      onClose={close}
      width="md"
      footer={
        <Button onClick={close}>{code ? t("common.cancel") : t("common.close")}</Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="tablist" aria-label={t("github.add.methodsLabel")} className="inline-flex w-fit gap-1 rounded-lg bg-subtle p-1">
          {methods.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={method === item.id}
              disabled={busy}
              onClick={() => setMethod(item.id)}
              className={cn(
                "h-7 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed",
                method === item.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <TextField
          label={t("github.add.host")}
          hint={t("github.add.hostHint")}
          value={host}
          disabled={busy}
          onChange={(event) => setHost(event.target.value)}
          spellCheck={false}
        />

        {method === "browser" ? (
          code ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-canvas p-4 text-center" role="status">
              <p className="text-xs text-muted">{t("github.add.codeInstruction")}</p>
              <p className="selectable font-mono text-2xl font-semibold tracking-[0.2em]">{code.userCode}</p>
              <div className="flex gap-2">
                <Button size="sm" icon={<Copy className="size-3.5" />} onClick={() => void navigator.clipboard.writeText(code.userCode)}>
                  {t("github.add.copyCode")}
                </Button>
                <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => void openExternal(code.verificationUri)}>
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
              <TextField
                label={t("github.add.clientId")}
                hint={t("github.add.clientIdHint")}
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <div>
                <Button type="submit" variant="primary" disabled={clientId.trim().length === 0} loading={busy}>
                  {t("github.add.start")}
                </Button>
              </div>
            </form>
          )
        ) : (
          <form onSubmit={(event) => void submitToken(event)} className="flex flex-col gap-3">
            <TextField
              type="password"
              label={t("github.add.token")}
              hint={t("github.add.tokenHint")}
              value={token}
              disabled={busy}
              onChange={(event) => setToken(event.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <div>
              <Button type="submit" variant="primary" disabled={token.trim().length === 0} loading={busy}>
                {t("github.add.connect")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
