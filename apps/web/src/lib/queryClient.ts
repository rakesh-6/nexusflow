import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

// One cache for all data loaded from the API. Pages ask for data with
// useQuery(); repeated requests for the same data reuse the cached answer.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data counts as fresh for 30 seconds before it is fetched again.
      staleTime: 30_000,
      // Retry network and server hiccups, but not "you may not see this" answers.
      retry: (failureCount, error) =>
        failureCount < 2 &&
        !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});
