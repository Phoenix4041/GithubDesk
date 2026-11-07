import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import type { SignatureStatus } from "@/shared/types/git";
import { useCommitSignature, useSigningConfig } from "../queries";

type Tone = "good" | "warning" | "bad" | "muted";

const toneClasses: Record<Tone, string> = {
  good: "bg-add-bg text-add",
  warning: "bg-warning/15 text-warning",
  bad: "bg-del-bg text-del",
  muted: "bg-subtle text-muted",
};

function describe(status: SignatureStatus): { tone: Tone; icon: ReactNode } {
  switch (status) {
    case "good":
      return { tone: "good", icon: <ShieldCheck className="size-3" /> };
    case "goodUntrusted":
    case "goodExpired":
    case "goodExpiredKey":
    case "goodRevokedKey":
      return { tone: "warning", icon: <ShieldAlert className="size-3" /> };
    case "bad":
      return { tone: "bad", icon: <ShieldAlert className="size-3" /> };
    case "unverifiable":
      return { tone: "muted", icon: <ShieldQuestion className="size-3" /> };
    case "none":
      return { tone: "muted", icon: <ShieldQuestion className="size-3" /> };
  }
}

interface SignatureBadgeProps {
  repoPath: string;
  hash: string;
}

export function SignatureBadge({ repoPath, hash }: SignatureBadgeProps) {
  const { t } = useTranslation();
  const signature = useCommitSignature(repoPath, hash);
  const config = useSigningConfig(repoPath);

  if (!signature.data) {
    return null;
  }
  const { status, signer, key } = signature.data;
  if (status === "none" && !config.data?.enabled) {
    return null;
  }
  const { tone, icon } = describe(status);
  const details = [signer, key].filter((value): value is string => value !== null && value !== "").join(" - ");

  return (
    <span
      title={details === "" ? t(`signing.status.${status}.hint`) : `${t(`signing.status.${status}.hint`)} ${details}`}
      className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", toneClasses[tone])}
    >
      {icon}
      {t(`signing.status.${status}.label`)}
    </span>
  );
}
