import { useTranslation } from "react-i18next";
import { useRepositoriesStore } from "@/features/repositories/store";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";

interface RepositoryUnavailableProps {
  repoPath: string;
  error: unknown;
  onRetry: () => void;
}

export function RepositoryUnavailable({ repoPath, error, onRetry }: RepositoryUnavailableProps) {
  const { t } = useTranslation();
  const deactivate = useRepositoriesStore((state) => state.deactivate);
  const forget = useRepositoriesStore((state) => state.forget);
  const description = describeError(error);

  return (
    <main className="flex h-full flex-col items-center justify-center gap-4">
      <ErrorState title={description.title} message={`${description.message} ${repoPath}`} onRetry={onRetry} />
      <div className="flex gap-2 pb-10">
        <Button onClick={deactivate}>{t("unavailable.backToStart")}</Button>
        <Button variant="danger" onClick={() => forget(repoPath)}>
          {t("unavailable.forget")}
        </Button>
      </div>
    </main>
  );
}
