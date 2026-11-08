import { KeyRound, Lock, ShieldCheck, SlidersHorizontal, TriangleAlert, Users, Webhook } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { GithubGate, useGithubTarget } from "../../components/github-gate";
import { useRepoInfo } from "../../pulls/queries";
import type { GithubTarget } from "../../target";
import { SETTINGS_SECTIONS } from "../settings-model";
import type { SettingsSection } from "../settings-model";
import { useRepoSettingsStore } from "../store";
import { CollaboratorsSection } from "./collaborators-section";
import { DangerSection } from "./danger-section";
import { GeneralSection } from "./general-section";
import { HooksSection } from "./hooks-section";
import { KeysSection } from "./keys-section";
import { ProtectionSection } from "./protection-section";
import { SecretsSection } from "./secrets-section";

const ICONS: Record<SettingsSection, ReactNode> = {
  general: <SlidersHorizontal className="size-4" />,
  collaborators: <Users className="size-4" />,
  protection: <ShieldCheck className="size-4" />,
  hooks: <Webhook className="size-4" />,
  keys: <KeyRound className="size-4" />,
  actions: <Lock className="size-4" />,
  danger: <TriangleAlert className="size-4" />,
};

function SectionList() {
  const { t } = useTranslation();
  const section = useRepoSettingsStore((state) => state.section);
  const select = useRepoSettingsStore((state) => state.select);
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label={t("github.settings.listLabel")}>
      {SETTINGS_SECTIONS.map((item) => (
        <button
          key={item}
          type="button"
          aria-current={section === item ? "page" : undefined}
          onClick={() => select(item)}
          className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors duration-150 hover:bg-subtle",
            section === item && "bg-accent-soft font-medium text-accent",
            item === "danger" && section !== item && "text-danger",
          )}
        >
          {ICONS[item]}
          {t(`github.settings.sections.${item}`)}
        </button>
      ))}
    </nav>
  );
}

export function SettingsSectionsPanel({ repoPath }: { repoPath: string }) {
  return <GithubGate repoPath={repoPath}>{() => <SectionList />}</GithubGate>;
}

function Content({ target, section, canAdmin }: { target: GithubTarget; section: SettingsSection; canAdmin: boolean }) {
  const { t } = useTranslation();
  switch (section) {
    case "general":
      return <GeneralSection target={target} canAdmin={canAdmin} />;
    case "collaborators":
      return <CollaboratorsSection target={target} canAdmin={canAdmin} />;
    case "protection":
      return <ProtectionSection target={target} canAdmin={canAdmin} />;
    case "hooks":
      return <HooksSection target={target} canAdmin={canAdmin} />;
    case "keys":
      return <KeysSection target={target} canAdmin={canAdmin} />;
    case "actions":
      return (
        <SecretsSection
          scope={{ accountId: target.accountId, owner: target.owner, repo: target.repo, org: null }}
          canAdmin={canAdmin}
          title={t("github.settings.sections.actions")}
        />
      );
    case "danger":
      return <DangerSection target={target} canAdmin={canAdmin} />;
  }
}

export function SettingsPanel({ repoPath }: { repoPath: string }) {
  const { target } = useGithubTarget(repoPath);
  const section = useRepoSettingsStore((state) => state.section);
  if (!target) {
    return null;
  }
  return <PanelBody target={target} section={section} />;
}

function PanelBody({ target, section }: { target: GithubTarget; section: SettingsSection }) {
  const { t } = useTranslation();
  const info = useRepoInfo(target);
  const known = info.data !== undefined;
  const canAdmin = info.data?.permissions?.admin === true;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 p-6">
        {known && !canAdmin ? (
          <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning" role="status">
            {t("github.settings.readOnly")}
          </p>
        ) : null}
        <Content key={`${target.owner}/${target.repo}/${section}`} target={target} section={section} canAdmin={canAdmin} />
      </div>
    </div>
  );
}
