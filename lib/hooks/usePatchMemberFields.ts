/**
 * Optimistic dimension-write mutation (member-intelligence PR3). Stamps provenance on the
 * server (patchMemberFields) and mirrors it client-side via the same pure merge
 * (optimisticApplyFieldWrites) so the UI reflects the edit before the server confirms,
 * rolling back on error and reconciling on settle.
 *
 * Targets the no-limit record key (memberKeys.record(id)) — the record page's primary
 * query — for the optimistic patch.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  memberKeys,
  patchMemberFields,
  optimisticApplyFieldWrites,
  type FieldWriteInput,
} from '@/lib/member-client';
import type { MemberRecord } from '@/lib/member-record';

export function usePatchMemberFields(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields: Record<string, FieldWriteInput>) => patchMemberFields(id, fields),
    onMutate: async (fields) => {
      const key = memberKeys.record(id);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<MemberRecord>(key);
      if (prev) {
        qc.setQueryData(key, optimisticApplyFieldWrites(prev, fields, new Date().toISOString()));
      }
      return { prev };
    },
    onError: (_e, _f, ctx) => {
      if (ctx?.prev) qc.setQueryData(memberKeys.record(id), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: memberKeys.record(id) }),
  });
}
