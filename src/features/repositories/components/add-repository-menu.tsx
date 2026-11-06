import { Download, FolderOpen, FolderPlus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Menu } from "@/shared/ui/menu";
import { pickAndOpenRepository } from "../actions";
import { useRepositoryDialogStore } from "../dialog-store";

export function AddRepositoryMenu() {
  const { t } = useTranslation();
  const showDialog = useRepositoryDialogStore((state) => state.show);

  return (
    <Menu
      label={t("repositories.add")}
      trigger={<Plus className="size-4" />}
      items={[
        {
          label: t("repositories.openExisting"),
          icon: <FolderOpen className="size-4" />,
          onSelect: () => void pickAndOpenRepository(),
        },
        {
          label: t("repositories.createNew"),
          icon: <FolderPlus className="size-4" />,
          onSelect: () => showDialog("create"),
        },
        {
          label: t("repositories.cloneFromUrl"),
          icon: <Download className="size-4" />,
          onSelect: () => showDialog("clone"),
        },
      ]}
    />
  );
}
