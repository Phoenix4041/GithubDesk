import { useCallback, useRef, useState } from "react";
import { openExternal } from "@/shared/lib/external";
import { reportError } from "@/shared/lib/report-error";
import type { DeviceCode, GithubAccount } from "@/shared/types/git";
import { cancelDeviceFlow, completeDeviceFlow } from "./actions";
import { startDeviceFlow } from "./api";

export interface DeviceFlowOptions {
  scopes?: string[];
  expectedLogin?: string;
}

export interface DeviceFlow {
  code: DeviceCode | null;
  busy: boolean;
  start: (host: string, clientId: string, options?: DeviceFlowOptions) => Promise<GithubAccount | null>;
  cancel: () => void;
}

export function useDeviceFlow(): DeviceFlow {
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [busy, setBusy] = useState(false);
  const jobId = useRef<string | null>(null);

  const reset = useCallback(() => {
    setCode(null);
    setBusy(false);
    jobId.current = null;
  }, []);

  const cancel = useCallback(() => {
    if (jobId.current) {
      cancelDeviceFlow(jobId.current);
    }
    reset();
  }, [reset]);

  const start = useCallback(
    async (host: string, clientId: string, options: DeviceFlowOptions = {}): Promise<GithubAccount | null> => {
      setBusy(true);
      try {
        const device = await startDeviceFlow(host, clientId, options.scopes ?? null);
        setCode(device);
        const currentJob = crypto.randomUUID();
        jobId.current = currentJob;
        void openExternal(device.verificationUri);
        const account = await completeDeviceFlow(host, clientId, device, currentJob, options.expectedLogin ?? null);
        if (jobId.current === currentJob) {
          reset();
        }
        return account;
      } catch (error) {
        reportError(error);
        reset();
        return null;
      }
    },
    [reset],
  );

  return { code, busy, start, cancel };
}
