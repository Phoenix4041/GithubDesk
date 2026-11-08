import { Copy, ExternalLink, LogIn, Terminal } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/cn";
import { openExternal } from "@/shared/lib/external";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { Spinner } from "@/shared/ui/spinner";
import { TextField } from "@/shared/ui/text-field";
import { connectWithToken } from "../actions";
import { useLoginOptions } from "../queries";
import { useDeviceFlow } from "../use-device-flow";
import { useSystemLogin } from "../use-system-login";

type Method = "easy" | "browser" | "token";

interface AddAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_HOST = "github.com";

export function AddAccountDialog({ open, onClose }: AddAccountDialogProps) {
  const { t } = useTranslation();
  const savedClientId = useSettingsStore((state) => state.githubClientId);
  const setClientId = useSettingsStore((state) => state.setGithubClientId);
  const options = useLoginOptions(open);
  const [method, setMethod] = useState<Method>("easy");
  const [host, setHost] = useState(DEFAULT_HOST);
  const [token, setToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const device = useDeviceFlow();
  const system = useSystemLogin();
  const code = device.code;
  const busy = device.busy || savingToken || system.method !== null;
  const clientId = savedClientId.trim() || options.data?.embeddedClientId || "";

  function close() {
    device.cancel();
    system.cancel();
    setToken("");
    onClose();
  }

  async function signIn(chosen: "system" | "cli") {
    if (busy) {
      return;
    }
    const account = await system.start(host.trim(), chosen);
    if (account) {
      onClose();
    }
  }

  async function startBrowserFlow(event: FormEvent) {
    event.preventDefault();
    if (busy || clientId.length === 0) {
      return;
    }
    const account = await device.start(host.trim(), clientId);
    if (account) {
      onClose();
    }
  }

  async function submitToken(event: FormEvent) {
    event.preventDefault();
    if (busy || token.trim().length === 0) {
      return;
    }
    setSavingToken(true);
    const account = await connectWithToken(host.trim(), token.trim());
    setSavingToken(false);
    if (account) {
      setToken("");
      onClose();
    }
  }

  const methods: Array<{ id: Method; label: string }> = [
    { id: "easy", label: t("github.add.methods.easy") },
    { id: "browser", label: t("github.add.methods.browser") },
    { id: "token", label: t("github.add.methods.token") },
  ];
  const nothingAvailable = options.data !== undefined && !options.data.system && !options.data.cli;

  return (
    <Dialog
      open={open}
      title={t("github.add.title")}
      description={t("github.add.description")}
      onClose={close}
      width="md"
      footer={<Button onClick={close}>{code || system.method ? t("common.cancel") : t("common.close")}</Button>}
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

        {method === "easy" ? (
          system.method ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-canvas p-4 text-center" role="status">
              <p className="flex items-center gap-2 text-xs text-muted">
                <Spinner />
                {t(system.method === "system" ? "github.add.waitingSystem" : "github.add.waitingCli")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted">{t("github.add.easyIntro")}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  icon={<LogIn className="size-3.5" />}
                  disabled={busy || options.data?.system === false}
                  onClick={() => void signIn("system")}
                >
                  {t("github.add.signIn")}
                </Button>
                <Button
                  icon={<Terminal className="size-3.5" />}
                  disabled={busy || options.data?.cli !== true}
                  onClick={() => void signIn("cli")}
                >
                  {t("github.add.useCli")}
                </Button>
              </div>
              {options.data?.system === false ? <p className="text-xs text-muted">{t("github.add.noHelper")}</p> : null}
              {options.data?.cli === false ? <p className="text-xs text-muted">{t("github.add.noCli")}</p> : null}
              {nothingAvailable ? <p className="text-xs text-muted">{t("github.add.nothingAvailable")}</p> : null}
              <p className="text-xs text-muted">{t("github.add.limits")}</p>
            </div>
          )
        ) : method === "browser" ? (
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
                hint={options.data?.embeddedClientId && savedClientId.trim().length === 0 ? t("github.add.clientIdEmbedded") : t("github.add.clientIdHint")}
                value={savedClientId}
                onChange={(event) => setClientId(event.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <div>
                <Button type="submit" variant="primary" disabled={clientId.length === 0} loading={device.busy}>
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
              <Button type="submit" variant="primary" disabled={token.trim().length === 0} loading={savingToken}>
                {t("github.add.connect")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
