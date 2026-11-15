import { useCallback, useEffect, useState } from "react";
import type { CheckState } from "../components/StatusCard";
import { ApiError, apiGet } from "../lib/api";

const errorDetail = (error: unknown) =>
  error instanceof ApiError ? error.message : "Something went wrong";

/** Asks the API whether it and the database are working; `recheck` asks again. */
export function useSystemStatus() {
  const [api, setApi] = useState<CheckState>({ status: "checking" });
  const [database, setDatabase] = useState<CheckState>({ status: "checking" });

  const recheck = useCallback(() => {
    setApi({ status: "checking" });
    setDatabase({ status: "checking" });

    apiGet<{ uptimeSeconds: number }>("/api/v1/health")
      .then((data) => setApi({ status: "ok", detail: `Running for ${data.uptimeSeconds} s` }))
      .catch((error: unknown) => setApi({ status: "error", detail: errorDetail(error) }));

    apiGet<{ latencyMs: number }>("/api/v1/health/ready")
      .then((data) => setDatabase({ status: "ok", detail: `Answered in ${data.latencyMs} ms` }))
      .catch((error: unknown) => setDatabase({ status: "error", detail: errorDetail(error) }));
  }, []);

  useEffect(recheck, [recheck]);

  return { api, database, recheck };
}
