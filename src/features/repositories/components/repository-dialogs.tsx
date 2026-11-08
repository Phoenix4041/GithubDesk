import { useRepositoryDialogStore } from "../dialog-store";
import { CloneRepositoryDialog } from "./clone-repository-dialog";
import { CreateRepositoryDialog } from "./create-repository-dialog";

export function RepositoryDialogs() {
  const dialog = useRepositoryDialogStore((state) => state.dialog);
  const hide = useRepositoryDialogStore((state) => state.hide);
  const preset = useRepositoryDialogStore((state) => state.clonePreset);

  return (
    <>
      <CloneRepositoryDialog key={preset?.url ?? "manual"} open={dialog === "clone"} preset={preset} onClose={hide} />
      <CreateRepositoryDialog open={dialog === "create"} onClose={hide} />
    </>
  );
}
