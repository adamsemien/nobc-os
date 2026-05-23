'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { TemplatePicker, type TemplateKey } from '../../new/_components/TemplatePicker';
import { AccessGroupsCard } from '../../new/_components/AccessGroupsCard';
import {
  parseEventAccess,
} from '@/lib/event-access';
import { deriveLegacyFromAccess } from '@/lib/event-access-derive';
import type { EventAccess } from '@/lib/event-access-schema';
import {
  type AccessQuestion,
  fromApiQuestion,
  toApiQuestion,
} from '@/lib/registration-fields';
import { TierManager } from './TierManager';

type EventFull = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  heroImageAssetId: string | null;
  startAt: string;
  endAt: string | null;
  location: string | null;
  status: string;
  accessMode: string;
  applyMode: string | null;
  capacity: number | null;
  showCapacity: boolean;
  approvalRequired: boolean;
  plusOnesAllowed: boolean;
  priceInCents: number | null;
  nonMemberPriceInCents: number | null;
  eventAccess: unknown;
  runOfShow: string | null;
  template: string;
  customQuestions: {
    id: string;
    label: string;
    fieldType: string;
    options: string[];
    required: boolean;
    order: number;
    showToMember: boolean;
    showToGuest: boolean;
  }[];
  _count: { rsvps: number };
};

type Props = { event: EventFull };

function toDateInput(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function toTimeInput(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(11, 16);
}

function combineDatetime(date: string, time: string): string | null {
  if (!date) return null;
  const t = time || '00:00';
  return new Date(`${date}T${t}`).toISOString();
}

export function EventSettingsTab({ event }: Props) {
  const [title, setTitle] = useState(event.title);
  const [slug, setSlug] = useState(event.slug);
  const [slugError, setSlugError] = useState('');
  const [description, setDescription] = useState(event.description ?? '');
  const [startDate, setStartDate] = useState(toDateInput(event.startAt));
  const [startTime, setStartTime] = useState(toTimeInput(event.startAt));
  const [endDate, setEndDate] = useState(toDateInput(event.endAt));
  const [endTime, setEndTime] = useState(toTimeInput(event.endAt));
  const [location, setLocation] = useState(event.location ?? '');
  const [heroImageAssetId, setHeroImageAssetId] = useState(event.heroImageAssetId ?? '');
  const [capacity, setCapacity] = useState(event.capacity ? String(event.capacity) : '');
  const [eventAccess, setEventAccess] = useState<EventAccess>(() => parseEventAccess(event.eventAccess));
  const [plusOnesAllowed, setPlusOnesAllowed] = useState(event.plusOnesAllowed);
  const [showCapacity, setShowCapacity] = useState(event.showCapacity);
  const [runOfShow, setRunOfShow] = useState(event.runOfShow ?? '');
  const [template, setTemplate] = useState<TemplateKey>(
    (event.template as TemplateKey) ?? 'editorial',
  );
  const [questions, setQuestions] = useState<AccessQuestion[]>(() =>
    event.customQuestions.map(fromApiQuestion),
  );

  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);
  const [statusPending, setStatusPending] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(event.status);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateFlash, setTemplateFlash] = useState('');

  function handleSlugChange(val: string) {
    setSlug(val);
    if (val && !/^[a-z0-9-]+$/.test(val)) {
      setSlugError('Only lowercase letters, numbers, and hyphens');
    } else {
      setSlugError('');
    }
  }

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/operator/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Request failed (${res.status})`);
    }
    return res.json();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (slugError) return;
    setSaving(true);
    setFlash(null);
    try {
      const body: Record<string, unknown> = {
        customQuestions: questions.map(q => ({
          ...toApiQuestion(q),
          id: q.id ?? '',
        })),
        title,
        slug: slug || undefined,
        description: description || undefined,
        startAt: combineDatetime(startDate, startTime),
        endAt: combineDatetime(endDate, endTime) || undefined,
        location: location || undefined,
        heroImageAssetId: heroImageAssetId || undefined,
        capacity: capacity ? parseInt(capacity, 10) : null,
        plusOnesAllowed,
        showCapacity,
        runOfShow: runOfShow || undefined,
        template,
        eventAccess,
      };
      await patch(body);
      setToast('Flow saved ✓');
    } catch (e) {
      setFlash({ type: 'error', message: e instanceof Error ? e.message : 'Save failed.' });
    } finally {
      setSaving(false);
      window.setTimeout(() => setFlash(null), 4000);
    }
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    setTemplateFlash('');
    try {
      const derived = deriveLegacyFromAccess(eventAccess);
      const res = await fetch('/api/operator/event-flow-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName.trim(),
          accessMode: derived.accessMode,
          priceInCents: derived.priceInCents,
          nonMemberPriceInCents: derived.nonMemberPriceInCents,
          approvalRequired: derived.approvalRequired,
          plusOnesAllowed,
          showCapacity,
          customQuestions: questions.map(q => ({
            label: q.label,
            type: q.type,
            required: q.required,
            options: q.type === 'select' ? q.options : [],
          })),
        }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setTemplateName('');
      setTemplateFlash('Flow template saved.');
    } catch (e) {
      setTemplateFlash(e instanceof Error ? e.message : 'Failed to save template.');
    } finally {
      setSavingTemplate(false);
      window.setTimeout(() => setTemplateFlash(''), 4000);
    }
  }

  async function handleStatusChange(newStatus: 'PUBLISHED' | 'DRAFT') {
    setStatusPending(true);
    setFlash(null);
    try {
      await patch({ status: newStatus });
      setCurrentStatus(newStatus);
      setFlash({ type: 'success', message: newStatus === 'PUBLISHED' ? 'Event published.' : 'Event unpublished.' });
    } catch (e) {
      setFlash({ type: 'error', message: e instanceof Error ? e.message : 'Failed.' });
    } finally {
      setStatusPending(false);
      window.setTimeout(() => setFlash(null), 4000);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSave} className="space-y-6">
      {flash && (
        <div
          className={`rounded-md border border-border px-4 py-3 text-sm ${
            flash.type === 'success' ? 'bg-surface text-text-primary' : 'bg-surface text-text-secondary'
          }`}
          style={{ borderRadius: '6px' }}
        >
          {flash.message}
        </div>
      )}

      {/* Title */}
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">Title</label>
        <input
          required
          type="text"
          className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          style={{ borderRadius: '6px' }}
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
      </div>

      {/* Slug */}
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">Slug</label>
        <input
          type="text"
          className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          style={{ borderRadius: '6px' }}
          value={slug}
          onChange={e => handleSlugChange(e.target.value)}
        />
        {slugError && <p className="mt-1 text-xs text-text-muted">{slugError}</p>}
        {slug && !slugError && (
          <p className="mt-1 text-xs text-text-muted">
            /m/events/<span className="text-text-secondary">{slug}</span>
          </p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">Description</label>
        <textarea
          rows={5}
          className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          style={{ borderRadius: '6px' }}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      {/* Start date + time */}
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          Start date &amp; time
        </label>
        <div className="flex gap-2">
          <input
            required
            type="date"
            className="flex-1 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            style={{ borderRadius: '6px' }}
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          <input
            type="time"
            className="w-36 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            style={{ borderRadius: '6px' }}
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
          />
        </div>
      </div>

      {/* End date + time */}
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          End date &amp; time <span className="text-text-muted">(optional)</span>
        </label>
        <div className="flex gap-2">
          <input
            type="date"
            className="flex-1 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            style={{ borderRadius: '6px' }}
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
          <input
            type="time"
            className="w-36 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            style={{ borderRadius: '6px' }}
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
          />
        </div>
      </div>

      {/* Location */}
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">Location</label>
        <input
          type="text"
          className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          style={{ borderRadius: '6px' }}
          value={location}
          onChange={e => setLocation(e.target.value)}
        />
      </div>

      {/* Hero image URL */}
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">Hero image URL</label>
        <input
          type="url"
          className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
          style={{ borderRadius: '6px' }}
          placeholder="https://..."
          value={heroImageAssetId}
          onChange={e => setHeroImageAssetId(e.target.value)}
        />
      </div>

      {/* Capacity */}
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          Capacity <span className="text-text-muted">(optional)</span>
        </label>
        <input
          type="number"
          min={1}
          className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          style={{ borderRadius: '6px' }}
          value={capacity}
          onChange={e => setCapacity(e.target.value)}
        />
      </div>

      {/* Access — three-group flow builder */}
      <div className="border-t border-border pt-6">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-text-secondary">Access</p>
        <AccessGroupsCard
          value={eventAccess}
          onChange={setEventAccess}
          questions={questions}
          onQuestionsChange={setQuestions}
          eventTitle={title}
        />
      </div>

      {/* Ticket tiers — pricing belongs with the access/gates config, not at the page bottom */}
      <div className="border-t border-border pt-6">
        <TierManager eventId={event.id} />
      </div>

      {/* Toggles */}
      <div className="space-y-3 rounded-lg border border-border p-4" style={{ borderRadius: '8px' }}>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-text-primary">
          <input
            type="checkbox"
            className="accent-primary h-4 w-4"
            checked={plusOnesAllowed}
            onChange={e => setPlusOnesAllowed(e.target.checked)}
          />
          Plus-ones allowed
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-text-primary">
          <input
            type="checkbox"
            className="accent-primary h-4 w-4"
            checked={showCapacity}
            onChange={e => setShowCapacity(e.target.checked)}
          />
          Show capacity to members
        </label>
      </div>

      {/* Run of show */}
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">Run of show</label>
        <textarea
          rows={4}
          className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          style={{ borderRadius: '6px' }}
          value={runOfShow}
          onChange={e => setRunOfShow(e.target.value)}
        />
      </div>

      {/* Template */}
      <div>
        <label className="mb-2 block text-sm font-medium text-text-secondary">Template</label>
        <TemplatePicker value={template} onChange={setTemplate} compact />
      </div>

      {/* Save as flow template */}
      <div className="space-y-3 border-t border-border pt-6">
        <div>
          <p className="text-sm font-medium text-text-secondary">Save as flow template</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Reuse this event&apos;s access mode, pricing, and questions on future events.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. Members Apply, Others Pay"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            className="flex-1 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
            style={{ borderRadius: '6px' }}
          />
          <button
            type="button"
            disabled={!templateName.trim() || savingTemplate}
            onClick={handleSaveTemplate}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-muted disabled:opacity-50"
            style={{ borderRadius: '6px' }}
          >
            {savingTemplate && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
        {templateFlash && (
          <p className="text-xs text-text-secondary">{templateFlash}</p>
        )}
      </div>

      {/* Save */}
      <button
        type="submit"
        disabled={saving || !!slugError}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity disabled:opacity-50"
        style={{ borderRadius: '6px' }}
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? 'Saving…' : 'Save Changes'}
      </button>

      {/* Status actions */}
      <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row">
        {currentStatus === 'DRAFT' && (
          <button
            type="button"
            onClick={() => handleStatusChange('PUBLISHED')}
            disabled={statusPending}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-surface-elevated px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-muted disabled:opacity-50"
            style={{ borderRadius: '6px' }}
          >
            {statusPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Publish
          </button>
        )}
        {currentStatus === 'PUBLISHED' && (
          <button
            type="button"
            onClick={() => handleStatusChange('DRAFT')}
            disabled={statusPending}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-surface-elevated px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-muted disabled:opacity-50"
            style={{ borderRadius: '6px' }}
          >
            {statusPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Unpublish
          </button>
        )}
        {currentStatus === 'DRAFT' && (
          <button
            type="button"
            disabled
            title="Can only delete drafts via database"
            className="inline-flex flex-1 cursor-not-allowed items-center justify-center rounded-md border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-text-muted opacity-50"
            style={{ borderRadius: '6px' }}
          >
            Delete
          </button>
        )}
      </div>
      {toast && <FlowToast message={toast} />}
      </form>
    </div>
  );
}

function FlowToast({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="toast-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-sm bg-[var(--text-primary)] px-4 py-2.5 text-[12px] font-medium text-[var(--bg)] shadow-[0_4px_16px_rgba(0,0,0,0.25)]"
    >
      {message}
    </div>
  );
}
