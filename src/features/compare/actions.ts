import { useUiStore } from "@/shared/lib/ui-store";
import { useCompareStore } from "./store";

export function openCompare(base: string, head: string, exact = false): void {
  useCompareStore.getState().open(base, head, exact);
  useUiStore.getState().setTab("compare");
}

export function closeCompare(): void {
  useCompareStore.getState().close();
  if (useUiStore.getState().tab === "compare") {
    useUiStore.getState().setTab("changes");
  }
}
