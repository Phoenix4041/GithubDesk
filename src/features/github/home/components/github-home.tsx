import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/cn";
import { useUiStore } from "@/shared/lib/ui-store";
import { Button } from "@/shared/ui/button";
import { useAccounts } from "../../queries";
import { contextTitle, homeContext } from "../home-model";
import { InboxPanel } from "./inbox-panel";
import { RepoBrowser } from "./repo-browser";

type HomeTab = "repos" | "inbox";

export function GithubHome() {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const profiles = useSettingsStore((state) => state.profiles);
  const activeProfileId = useSettingsStore((state) => state.activeProfileId);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const [tab, setTab] = useState<HomeTab>("repos");

  if (accounts.isPending) {
    return null;
  }
  const context = homeContext(profiles, activeProfileId, accounts.data ?? []);
  if (!context.account) {
    return (
      <section className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4" aria-label={t("github.home.title")}>
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[13px] font-semibold">{t("github.home.connectTitle")}</h2>
          <p className="text-xs text-muted">{t("github.home.connectDescription")}</p>
        </div>
        <Button variant="primary" onClick={() => setSettingsOpen(true)}>
          {t("github.home.connectAction")}
        </Button>
      </section>
    );
  }

  const tabs: Array<{ id: HomeTab; label: string }> = [
    { id: "repos", label: t("github.home.tabs.repos") },
    { id: "inbox", label: t("github.home.tabs.inbox") },
  ];

  return (
    <section className="flex flex-col gap-2" aria-label={t("github.home.title")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
          {t("github.home.title")} &middot; {contextTitle(context)}
        </h2>
        <div role="tablist" aria-label={t("github.home.tabsLabel")} className="inline-flex gap-1 rounded-lg bg-subtle p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "h-6 cursor-pointer rounded-md px-2.5 text-xs font-medium transition-colors duration-150",
                tab === item.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "repos" ? (
        <RepoBrowser key={`${context.account.id}|${context.org ?? ""}`} account={context.account} org={context.org} />
      ) : (
        <InboxPanel key={`${context.account.id}|${context.org ?? ""}`} account={context.account} org={context.org} />
      )}
    </section>
  );
}
