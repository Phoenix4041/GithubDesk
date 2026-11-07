import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { useForcePushStore } from "../force-push-store";
import { runSyncOperation } from "../operations";

interface ForcePushDialogProps {
  repoPath: string;
}

export function ForcePushDialog({ repoPath }: ForcePushDialogProps) {
  const { t } = useTranslation();
  const target = useForcePushStore((state) => state.repoPath);
  const hide = useForcePushStore((state) => state.hide);

  return (
    <ConfirmDialog
      open={target === repoPath}
      title={t("sync.forcePushDialog.title")}
      description={t("sync.forcePushDialog.description")}
      consequences={[t("sync.forcePushDialog.loss")]}
      confirmLabel={t("sync.forcePushDialog.confirm")}
      destructive
      onConfirm={() => {
        hide();
        void runSyncOperation("forcePush", repoPath);
      }}
      onCancel={hide}
    />
  );
}
