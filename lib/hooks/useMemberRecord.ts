/**
 * TanStack Query hook for the operator-facing member record (member-intelligence PR3).
 * Thin wrapper over the dependency-free fetcher in lib/member-client.ts — the query key
 * factory keeps cache reads and the optimistic mutation (usePatchMemberFields) in sync.
 */
import { useQuery } from '@tanstack/react-query';
import { memberKeys, fetchMemberRecord } from '@/lib/member-client';
import type { MemberRecord } from '@/lib/member-record';

export function useMemberRecord(
  id: string,
  opts?: { limit?: number; initialData?: MemberRecord },
) {
  return useQuery({
    queryKey: memberKeys.record(id, opts?.limit),
    queryFn: ({ signal }) => fetchMemberRecord(id, { limit: opts?.limit, signal }),
    // Server-rendered record passed straight in so the island doesn't refetch on mount and
    // the cache is primed for the Slice 2 optimistic mutation. Omitted → normal fetch.
    initialData: opts?.initialData,
  });
}
