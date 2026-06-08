'use client';

/**
 * Editable right-rail panels (member-intelligence PR3 Slice 2, F4 + F5 render). Client island:
 * reads the record from the shared TanStack cache (seeded by the RSC's initialData) and writes
 * through usePatchMemberFields — optimistic, provenance-stamped (operator_entered, confidence 1).
 *
 *  - Profile: the safe first-class Member columns (firmographic + demographic), inline-editable.
 *  - Fields:  customFields rendered by their FieldDefinition (F5) — label/type/options — plus any
 *             legacy keys without a definition. Defined-but-empty fields show as editable rows.
 *  - Summary: the aiSummary, editable as a textarea.
 *
 * Edit affordances render only when `canEdit` (STAFF+ and not a merged record). Reserved/firewall
 * keys (archetype/psychographics) are never rendered or editable here. Design tokens only.
 */
import { useMemberRecord } from '@/lib/hooks/useMemberRecord';
import { usePatchMemberFields } from '@/lib/hooks/usePatchMemberFields';
import type { MemberRecord } from '@/lib/member-record';
import { EditableField, type EditableFieldType, type EditableValue } from './EditableField';

const PROFILE_FIELDS: Array<{ key: string; label: string; type: EditableFieldType }> = [
  { key: 'companyName', label: 'Company', type: 'text' },
  { key: 'jobFunction', label: 'Role', type: 'text' },
  { key: 'seniority', label: 'Seniority', type: 'text' },
  { key: 'industry', label: 'Industry', type: 'text' },
  { key: 'companySize', label: 'Company size', type: 'text' },
  { key: 'companyDomain', label: 'Domain', type: 'url' },
  { key: 'linkedinUrl', label: 'LinkedIn', type: 'url' },
  { key: 'instagram', label: 'Instagram', type: 'text' },
  { key: 'city', label: 'City', type: 'text' },
  { key: 'country', label: 'Country', type: 'text' },
  { key: 'ageRange', label: 'Age range', type: 'text' },
];

function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-5">{children}</div>;
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{children}</div>
  );
}

export function MemberEditablePanels({
  id,
  initialData,
  canEdit,
}: {
  id: string;
  initialData: MemberRecord;
  canEdit: boolean;
}) {
  const { data } = useMemberRecord(id, { initialData });
  const rec = data ?? initialData;
  const patch = usePatchMemberFields(id);

  const save = (key: string) => (value: EditableValue) =>
    patch.mutate({ [key]: { value, source: 'operator_entered', confidence: 1 } });

  const dims = { ...rec.dimensions.firmographic, ...rec.dimensions.demographic } as Record<string, unknown>;
  const prov = (rec.fieldProvenance ?? {}) as Record<string, { source?: string } | undefined>;
  const custom = (rec.customFields ?? {}) as Record<string, unknown>;

  const defKeys = new Set(rec.fieldDefs.map((d) => d.stableKey));
  const orphanKeys = Object.keys(custom).filter((k) => !defKeys.has(k));
  const hasFields = rec.fieldDefs.length > 0 || orphanKeys.length > 0;

  return (
    <>
      <Card>
        <CardLabel>Profile</CardLabel>
        <div className="space-y-1">
          {PROFILE_FIELDS.map((f) => (
            <EditableField
              key={f.key}
              label={f.label}
              value={dims[f.key] ?? null}
              type={f.type}
              source={prov[f.key]?.source ?? null}
              editable={canEdit}
              onSave={save(f.key)}
            />
          ))}
        </div>
      </Card>

      {hasFields || canEdit ? (
        <Card>
          <CardLabel>Fields</CardLabel>
          {hasFields ? (
            <div className="space-y-1">
              {rec.fieldDefs.map((d) => (
                <EditableField
                  key={d.stableKey}
                  label={d.name}
                  value={custom[d.stableKey] ?? null}
                  type={(d.type as EditableFieldType) ?? 'text'}
                  options={d.options}
                  source={prov[d.stableKey]?.source ?? null}
                  editable={canEdit}
                  onSave={save(d.stableKey)}
                />
              ))}
              {orphanKeys.map((k) => (
                <EditableField
                  key={k}
                  label={humanizeKey(k)}
                  value={custom[k] ?? null}
                  type="text"
                  source={prov[k]?.source ?? null}
                  editable={canEdit}
                  onSave={save(k)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">
              No custom fields yet. An admin can define them in Settings → Member fields.
            </p>
          )}
        </Card>
      ) : null}

      <Card>
        <CardLabel>AI summary</CardLabel>
        <EditableField
          label="Summary"
          value={rec.member.aiSummary}
          type="textarea"
          source={prov.aiSummary?.source ?? null}
          editable={canEdit}
          onSave={save('aiSummary')}
          placeholder="Add a summary"
        />
      </Card>
    </>
  );
}
