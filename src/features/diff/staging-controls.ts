import type { LineSelection } from "@/shared/types/git";

export interface StagingControls {
  mode: "stage" | "unstage";
  busy: boolean;
  onApply: (selections: LineSelection[]) => void;
}
