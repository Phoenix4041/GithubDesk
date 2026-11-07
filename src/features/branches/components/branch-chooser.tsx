import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { useBranches } from "../queries";

interface BranchChooserProps {
  repoPath: string;
  title: string;
  description: string;
  onChoose: (branch: string) => void;
  onCancel: () => void;
}

export function BranchChooser({ repoPath, title, description, onChoose, onCancel }: BranchChooserProps) {
  const { t } = useTranslation();
  const branches = useBranches(repoPath);
  const [chosen, setChosen] = useState("");
  const candidates = (branches.data ?? []).filter((branch) => !branch.isCurrent);
  const selected = chosen !== "" ? chosen : (candidates[0]?.name ?? "");

  return (
    <Dialog
      open
      title={title}
      description={description}
      onClose={onCancel}
      width="sm"
      footer={
        <>
          <Button onClick={onCancel}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={selected === ""} onClick={() => onChoose(selected)}>
            {t("branches.chooser.next")}
          </Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <p className="text-xs text-muted">{t("branches.chooser.none")}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="branch-chooser" className="text-xs font-medium">
            {t("branches.chooser.label")}
          </label>
          <select
            id="branch-chooser"
            data-autofocus
            value={selected}
            onChange={(event) => setChosen(event.target.value)}
            className="h-8 cursor-pointer rounded-md border border-line bg-surface px-2 text-[13px] text-fg focus-visible:border-accent focus-visible:outline-none"
          >
            {candidates.map((branch) => (
              <option key={branch.fullName} value={branch.name}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </Dialog>
  );
}
