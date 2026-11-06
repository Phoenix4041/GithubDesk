import { translateIfPresent } from "@/i18n";
import type { Progress } from "@/shared/types/git";

export function describeProgress(progress: Progress | null): string {
  if (!progress) {
    return "";
  }
  const phase = translateIfPresent(`progress.${progress.phase}`, progress.phase);
  return `${phase} ${progress.percent}%`;
}
