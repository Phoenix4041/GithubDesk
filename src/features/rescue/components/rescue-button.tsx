import { LifeBuoy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/shared/ui/icon-button";
import { useRescueDialogStore } from "../store";

export function RescueButton() {
  const { t } = useTranslation();
  const show = useRescueDialogStore((state) => state.show);
  return (
    <IconButton label={t("rescue.open")} onClick={show}>
      <LifeBuoy className="size-4" />
    </IconButton>
  );
}
