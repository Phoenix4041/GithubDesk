import { useUiStore } from "@/shared/lib/ui-store";
import { useCompareStore } from "./store";

export function openCompare(base: string, head: string): void {
  useCompareStore.getState().open(base, head);
  useUiStore.getState().setTab("compare");
}

export function closeCompare(): void {
  useCompareStore.getState().close();
  if (useUiStore.getState().tab === "compare") {
    useUiStore.getState().setTab("changes");
  }
}
