import { ScrollText, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/shared/ui/icon-button";
import { useUndoPlan } from "../queries";
import { useReflogDialogStore } from "../store";

interface ReflogButtonsProps {
  repoPath: string;
}

export function ReflogButtons({ repoPath }: ReflogButtonsProps) {
  const { t } = useTranslation();
  const plan = useUndoPlan(repoPath);
  const show = useReflogDialogStore((state) => state.show);

  const undoLabel = plan.data
    ? t("reflog.undo.tooltip", { action: t(`reflog.actions.${plan.data.action}`), message: plan.data.message })
    : t("reflog.undo.nothing");

  return (
    <div className="flex items-center">
      <IconButton label={undoLabel} disabled={!plan.data} onClick={() => show({ kind: "undo" })}>
        <Undo2 className="size-4" />
      </IconButton>
      <IconButton label={t("reflog.open")} onClick={() => show({ kind: "list" })}>
        <ScrollText className="size-4" />
      </IconButton>
    </div>
  );
}
