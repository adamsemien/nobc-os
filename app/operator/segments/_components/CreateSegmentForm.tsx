'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONTACT_ROLE_LABELS } from '@/lib/crm/labels';
import { MEMBER_STATUS_LABELS } from '../../people/person-display';

const inputClass =
  'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]';
const selectClass = inputClass;
const labelClass = 'mb-1 block text-xs font-medium text-text-secondary';

const FIRMOGRAPHIC_FIELDS = [
  { value: 'industry', label: 'Industry' },
  { value: 'jobFunction', label: 'Job function' },
  { value: 'seniority', label: 'Seniority' },
  { value: 'companySize', label: 'Company size' },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
  { value: 'companyName', label: 'Company name' },
] as const;

export function CreateSegmentForm({
  sourceOptions,
  tagOptions,
  eventOptions,
}: {
  sourceOptions: Array<{ value: string; label: string }>;
  tagOptions: Array<{ value: string; label: string }>;
  eventOptions: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'DYNAMIC' | 'STATIC'>('DYNAMIC');

  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [verified, setVerified] = useState('');
  const [membership, setMembership] = useState('');
  const [membershipStatus, setMembershipStatus] = useState('');
  const [consent, setConsent] = useState('');
  const [role, setRole] = useState('');
  const [tagId, setTagId] = useState('');
  const [eventId, setEventId] = useState('');
  const [firmographicField, setFirmographicField] = useState('');
  const [firmographicValue, setFirmographicValue] = useState('');
  const [customFieldKey, setCustomFieldKey] = useState('');
  const [customFieldValue, setCustomFieldValue] = useState('');
  const [createdAfter, setCreatedAfter] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);

    const definition: Record<string, unknown> = {};
    if (q.trim()) definition.q = q.trim();
    if (source) definition.source = source;
    if (verified) definition.verified = verified;
    if (membership) definition.membership = membership;
    if (membershipStatus) definition.membershipStatus = membershipStatus;
    if (consent) definition.consent = consent;
    if (role) definition.role = role;
    if (tagId) definition.tagId = tagId;
    if (eventId) definition.eventId = eventId;
    if (firmographicField && firmographicValue.trim()) {
      definition.firmographic = { field: firmographicField, value: firmographicValue.trim() };
    }
    if (customFieldKey.trim() && customFieldValue.trim()) {
      definition.customField = { stableKey: customFieldKey.trim(), value: customFieldValue.trim() };
    }
    if (createdAfter) definition.createdAfter = createdAfter;
    if (createdBefore) definition.createdBefore = createdBefore;

    try {
      const res = await fetch('/api/operator/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, kind, definition }),
      });
      const data = (await res.json().catch(() => null)) as { segment?: { id: string }; error?: unknown } | null;
      if (!res.ok || !data?.segment) {
        setError('Could not build the segment. Check the filters and try again.');
        return;
      }
      router.push(`/operator/segments/${data.segment.id}`);
    } catch {
      setError('Could not build the segment. Check the filters and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block">
          <span className={labelClass}>Name</span>
          <input
            autoFocus
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Austin members, always current"
          />
        </label>
      </div>
      <div>
        <label className="block">
          <span className={labelClass}>Description (optional)</span>
          <input
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>

      <div>
        <span className={labelClass}>Kind</span>
        <div className="flex gap-4 text-sm text-text-primary">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={kind === 'DYNAMIC'}
              onChange={() => setKind('DYNAMIC')}
            />
            Dynamic — always current
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={kind === 'STATIC'} onChange={() => setKind('STATIC')} />
            Static — freeze today&apos;s membership
          </label>
        </div>
      </div>

      <fieldset className="rounded-md border border-border p-4">
        <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
          People-list filters
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Name or email contains</span>
            <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelClass}>Source</span>
            <select className={selectClass} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Any source</option>
              {sourceOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Email verification</span>
            <select className={selectClass} value={verified} onChange={(e) => setVerified(e.target.value)}>
              <option value="">Any</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Membership</span>
            <select className={selectClass} value={membership} onChange={(e) => setMembership(e.target.value)}>
              <option value="">Any</option>
              <option value="member">Has a membership</option>
              <option value="none">CRM only — no membership</option>
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Consent</span>
            <select className={selectClass} value={consent} onChange={(e) => setConsent(e.target.value)}>
              <option value="">Any</option>
              <option value="subscribed">Subscribed</option>
              <option value="none">No consent on file</option>
            </select>
          </label>
        </div>
        {consent ? (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Reflects consent on file, not what Blast actually honors — this is not a reliable
            blast/send target. See the segment detail page for the full note.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="rounded-md border border-border p-4">
        <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
          Extended filters
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Role</span>
            <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Any role</option>
              {Object.entries(CONTACT_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Membership status</span>
            <select
              className={selectClass}
              value={membershipStatus}
              onChange={(e) => setMembershipStatus(e.target.value)}
            >
              <option value="">Any status</option>
              {Object.entries(MEMBER_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Tag</span>
            <select className={selectClass} value={tagId} onChange={(e) => setTagId(e.target.value)}>
              <option value="">Any tag</option>
              {tagOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Attended event</span>
            <select className={selectClass} value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">Any event</option>
              {eventOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Firmographic field</span>
            <select
              className={selectClass}
              value={firmographicField}
              onChange={(e) => setFirmographicField(e.target.value)}
            >
              <option value="">None</option>
              {FIRMOGRAPHIC_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Firmographic value</span>
            <input
              className={inputClass}
              value={firmographicValue}
              onChange={(e) => setFirmographicValue(e.target.value)}
              disabled={!firmographicField}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Custom field key</span>
            <input
              className={inputClass}
              value={customFieldKey}
              onChange={(e) => setCustomFieldKey(e.target.value)}
              placeholder="stableKey"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Custom field value</span>
            <input
              className={inputClass}
              value={customFieldValue}
              onChange={(e) => setCustomFieldValue(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Added after</span>
            <input
              type="date"
              className={inputClass}
              value={createdAfter}
              onChange={(e) => setCreatedAfter(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Added before</span>
            <input
              type="date"
              className={inputClass}
              value={createdBefore}
              onChange={(e) => setCreatedBefore(e.target.value)}
            />
          </label>
        </div>
        {eventId ? (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Event attendance can only be recorded against a Member — this filter silently
            excludes leads who haven&apos;t become a Member yet.
          </p>
        ) : null}
      </fieldset>

      {error ? (
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !name.trim()}
          className="inline-flex h-9 items-center rounded-md px-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--primary)' }}
        >
          {saving ? 'Building…' : 'Build segment'}
        </button>
      </div>
    </div>
  );
}
