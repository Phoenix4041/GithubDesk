import { useCallback, useRef, useState } from "react";
import { cancelJob } from "@/shared/lib/tauri-client";
import type { Progress } from "@/shared/types/git";

type JobExecutor<T> = (jobId: string, onProgress: (progress: Progress) => void) => Promise<T>;

export function useCancellableJob() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const jobIdRef = useRef<string | null>(null);

  const run = useCallback(async <T>(execute: JobExecutor<T>): Promise<T> => {
    const jobId = crypto.randomUUID();
    jobIdRef.current = jobId;
    setRunning(true);
    setProgress(null);
    try {
      return await execute(jobId, setProgress);
    } finally {
      jobIdRef.current = null;
      setRunning(false);
      setProgress(null);
    }
  }, []);

  const cancel = useCallback(() => {
    if (jobIdRef.current) {
      void cancelJob(jobIdRef.current);
    }
  }, []);

  return { run, cancel, running, progress };
}
