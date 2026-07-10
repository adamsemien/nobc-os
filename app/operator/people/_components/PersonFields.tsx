'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  EditableField,
  type EditableFieldType,
  type EditableValue,
} from '@/app/operator/members/_components/EditableField';

export type PersonFieldDef = {
  stableKey: string;
  name: string;
  type: string;
  options: string[];
};

/** Person-capable custom fields UI (CRM spine Slice 0). Reuses the
 *  layout-independent EditableField primitive already shared across the
 *  Member surface; writes through the new Person fields route, which reuses
 *  lib/member-provenance.ts's merge logic unchanged. */
export function PersonFields({
  personId,
  fieldDefs,
  customFields,
  fieldProvenance,
  canEdit,
}: {
  personId: string;
  fieldDefs: PersonFieldDef[];
  customFields: Record<string, unknown>;
  fieldProvenance: Record<string, { source?: string } | undefined>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function save(key: string, value: EditableValue) {
    setError(null);
    try {
      const res = await fetch(`/api/operator/people/${personId}/fields`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { [key]: { value, source: 'operator_entered', confidence: 1 } } }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not save changes.');
        return;
      }
      router.refresh();
    } catch {
      setError('Could not save changes.');
    }
  }

  if (fieldDefs.length === 0 && !canEdit) return null;

  return (
    <div>
      {fieldDefs.length > 0 ? (
        <div className="space-y-1">
          {fieldDefs.map((d) => (
            <EditableField
              key={d.stableKey}
              label={d.name}
              value={customFields[d.stableKey] ?? null}
              type={(d.type as EditableFieldType) ?? 'text'}
              options={d.options}
              source={fieldProvenance[d.stableKey]?.source ?? null}
              editable={canEdit}
              onSave={(value) => save(d.stableKey, value)}
            />
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-text-secondary">
          No custom fields yet. An admin can define them in Settings → Member fields.
        </p>
      )}
      {error ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
