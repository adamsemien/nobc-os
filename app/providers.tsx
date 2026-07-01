"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { MemberApiError } from "@/lib/member-client";
import SessionExpiryWarning from "@/components/auth/SessionExpiryWarning";

// Dev-only, lazily loaded so the devtools never reach the production bundle:
// `process.env.NODE_ENV` is statically inlined at build time, so in production this
// resolves to `null` and the dynamic import() is dead-code-eliminated. The package is
// a devDependency for the same reason. React.lazy REQUIRES a Suspense boundary — the
// <Suspense> below is load-bearing, not decorative (build won't catch a missing one).
const ReactQueryDevtools =
  process.env.NODE_ENV === "development"
    ? lazy(() =>
        import("@tanstack/react-query-devtools").then((m) => ({
          default: m.ReactQueryDevtools,
        })),
      )
    : null;

export function Providers({ children }: { children: ReactNode }) {
  // useState initializer runs once per mount → one stable QueryClient per request.
  // Never module-scoped (that would share cache across server requests) and never
  // recreated on re-render (that would drop the cache).
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Member records aren't second-to-second volatile; a 30s stale window
            // stops refetch storms when navigating between records.
            staleTime: 30_000,
            // Operators edit in place; a focus-refetch would fight optimistic
            // mutations and clobber an in-progress edit.
            refetchOnWindowFocus: false,
            // 4xx (403/404/400) are deterministic — never retry them. Retry only
            // transient 5xx/network failures, up to twice.
            retry: (failureCount, error) =>
              !(error instanceof MemberApiError && error.status < 500) &&
              failureCount < 2,
          },
          // Writes are never auto-retried — avoids double-writes; the UI surfaces the
          // error and the operator re-submits.
          mutations: { retry: 0 },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <SessionExpiryWarning />
      {children}
      {ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
