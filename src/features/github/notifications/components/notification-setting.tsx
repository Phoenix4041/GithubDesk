import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/features/settings/store";
import { ToggleRow } from "../../settings/components/section-frame";

export function NotificationSetting() {
  const { t } = useTranslation();
  const enabled = useSettingsStore((state) => state.notificationsEnabled);
  const setEnabled = useSettingsStore((state) => state.setNotificationsEnabled);
  return (
    <section className="flex flex-col gap-1.5" aria-label={t("github.notifications.settingTitle")}>
      <h3 className="text-xs font-medium">{t("github.notifications.settingTitle")}</h3>
      <ToggleRow
        label={t("github.notifications.settingLabel")}
        hint={t("github.notifications.settingHint")}
        checked={enabled}
        disabled={false}
        onChange={setEnabled}
      />
    </section>
  );
}
