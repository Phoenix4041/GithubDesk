import { useRepositoryDialogStore } from "../dialog-store";
import { CloneRepositoryDialog } from "./clone-repository-dialog";
import { CreateRepositoryDialog } from "./create-repository-dialog";

export function RepositoryDialogs() {
  const dialog = useRepositoryDialogStore((state) => state.dialog);
  const hide = useRepositoryDialogStore((state) => state.hide);

  return (
    <>
      <CloneRepositoryDialog open={dialog === "clone"} onClose={hide} />
      <CreateRepositoryDialog open={dialog === "create"} onClose={hide} />
    </>
  );
}
