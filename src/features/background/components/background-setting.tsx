import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ToggleRow } from "@/features/github/settings/components/section-frame";
import { useSettingsStore } from "@/features/settings/store";
import { reportError } from "@/shared/lib/report-error";
import { getAutostart, setAutostart } from "../api";
import { BACKGROUND_SYNC_MINUTES, clampSyncMinutes } from "../background-model";

export function BackgroundSetting() {
  const { t } = useTranslation();
  const syncEnabled = useSettingsStore((state) => state.backgroundSyncEnabled);
  const minutes = useSettingsStore((state) => state.backgroundSyncMinutes);
  const trayEnabled = useSettingsStore((state) => state.trayEnabled);
  const autostartEnabled = useSettingsStore((state) => state.autostartEnabled);
  const setSyncEnabled = useSettingsStore((state) => state.setBackgroundSyncEnabled);
  const setMinutes = useSettingsStore((state) => state.setBackgroundSyncMinutes);
  const setTrayEnabled = useSettingsStore((state) => state.setTrayEnabled);
  const setAutostartEnabled = useSettingsStore((state) => state.setAutostartEnabled);
  const [draft, setDraft] = useState(String(minutes));
  const [autostartBusy, setAutostartBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getAutostart()
      .then((enabled) => {
        if (active) {
          setAutostartEnabled(enabled);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [setAutostartEnabled]);

  const commitMinutes = () => {
    const next = clampSyncMinutes(Number(draft));
    setMinutes(next);
    setDraft(String(next));
  };

  const toggleAutostart = async (enabled: boolean) => {
    setAutostartBusy(true);
    try {
      setAutostartEnabled(await setAutostart(enabled));
    } catch (error) {
      reportError(error);
    } finally {
      setAutostartBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-1.5" aria-label={t("background.title")}>
      <h3 className="text-xs font-medium">{t("background.title")}</h3>
      <ToggleRow
        label={t("background.syncLabel")}
        hint={t("background.syncHint")}
        checked={syncEnabled}
        disabled={false}
        onChange={setSyncEnabled}
      />
      {syncEnabled ? (
        <label className="ml-6 flex items-center gap-2 text-xs text-muted">
          {t("background.minutesLabel")}
          <input
            type="number"
            min={BACKGROUND_SYNC_MINUTES.min}
            max={BACKGROUND_SYNC_MINUTES.max}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitMinutes}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitMinutes();
              }
            }}
            className="h-7 w-16 rounded-md border border-line bg-surface px-2 text-[13px] text-fg focus-visible:border-accent focus-visible:outline-none"
          />
        </label>
      ) : null}
      <ToggleRow
        label={t("background.trayLabel")}
        hint={t("background.trayHint")}
        checked={trayEnabled}
        disabled={false}
        onChange={setTrayEnabled}
      />
      <ToggleRow
        label={t("background.autostartLabel")}
        hint={t("background.autostartHint")}
        checked={autostartEnabled}
        disabled={autostartBusy}
        onChange={(enabled) => void toggleAutostart(enabled)}
      />
    </section>
  );
}
