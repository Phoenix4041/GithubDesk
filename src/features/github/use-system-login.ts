import { useCallback, useRef, useState } from "react";
import type { GithubAccount } from "@/shared/types/git";
import { cancelDeviceFlow, signInWithSystem } from "./actions";
import type { LoginMethod } from "./api";

export interface SystemLogin {
  method: LoginMethod | null;
  start: (host: string, method: LoginMethod) => Promise<GithubAccount | null>;
  cancel: () => void;
}

export function useSystemLogin(): SystemLogin {
  const [method, setMethod] = useState<LoginMethod | null>(null);
  const jobId = useRef<string | null>(null);

  const cancel = useCallback(() => {
    if (jobId.current) {
      cancelDeviceFlow(jobId.current);
    }
    jobId.current = null;
    setMethod(null);
  }, []);

  const start = useCallback(async (host: string, chosen: LoginMethod): Promise<GithubAccount | null> => {
    const currentJob = crypto.randomUUID();
    jobId.current = currentJob;
    setMethod(chosen);
    const account = await signInWithSystem(host, chosen, currentJob);
    if (jobId.current === currentJob) {
      jobId.current = null;
      setMethod(null);
    }
    return account;
  }, []);

  return { method, start, cancel };
}
