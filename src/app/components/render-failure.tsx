import { useTranslation } from "react-i18next";
import { useRepositoriesStore } from "@/features/repositories/store";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";

interface RenderFailureProps {
  error: Error;
  onReset: () => void;
}

export function RenderFailure({ error, onReset }: RenderFailureProps) {
  const { t } = useTranslation();
  const deactivate = useRepositoriesStore((state) => state.deactivate);

  return (
    <main className="flex h-full flex-col items-center justify-center gap-4">
      <ErrorState title={t("crash.title")} message={`${t("crash.message")} ${error.message}`} onRetry={onReset} />
      <div className="pb-10">
        <Button
          onClick={() => {
            deactivate();
            onReset();
          }}
        >
          {t("unavailable.backToStart")}
        </Button>
      </div>
    </main>
  );
}
