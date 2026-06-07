/**
 * TanStack Query hook for the operator-facing member record (member-intelligence PR3).
 * Thin wrapper over the dependency-free fetcher in lib/member-client.ts — the query key
 * factory keeps cache reads and the optimistic mutation (usePatchMemberFields) in sync.
 */
import { useQuery } from '@tanstack/react-query';
import { memberKeys, fetchMemberRecord } from '@/lib/member-client';

export function useMemberRecord(id: string, limit?: number) {
  return useQuery({
    queryKey: memberKeys.record(id, limit),
    queryFn: ({ signal }) => fetchMemberRecord(id, { limit, signal }),
  });
}
