'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

function toKebab(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function combineDatetime(date: string, time: string): string | null {
  if (!date) return null;
  const t = time || '00:00';
  return new Date(`${date}T${t}`).toISOString();
}

type FormState = {
  title: string;
  slug: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  heroImageAssetId: string;
  capacity: string;
  accessMode: 'OPEN' | 'TICKETED' | 'APPLY_OR_PAY';
  memberPrice: string;
  nonMemberPrice: string;
  approvalRequired: boolean;
  plusOnesAllowed: boolean;
  showCapacity: boolean;
  status: 'DRAFT' | 'PUBLISHED';
  runOfShow: string;
};

const INITIAL: FormState = {
  title: '',
  slug: '',
  description: '',
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  location: '',
  heroImageAssetId: '',
  capacity: '',
  accessMode: 'OPEN',
  memberPrice: '',
  nonMemberPrice: '',
  approvalRequired: false,
  plusOnesAllowed: false,
  showCapacity: false,
  status: 'DRAFT',
  runOfShow: '',
};

export default function NewEventPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugError, setSlugError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // AI builder state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Auto-generate slug from title
  useEffect(() => {
    if (!slugEdited) {
      setForm(prev => ({ ...prev, slug: toKebab(prev.title) }));
    }
  }, [form.title, slugEdited]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleSlugChange(val: string) {
    setSlugEdited(true);
    set('slug', val);
    if (val && !/^[a-z0-9-]+$/.test(val)) {
      setSlugError('Only lowercase letters, numbers, and hyphens');
    } else {
      setSlugError('');
    }
  }

  async function handleAiFill() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/agent/event-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setForm(prev => {
        const next = { ...prev };
        if (data.title) { next.title = data.title; }
        if (data.description) { next.description = data.description; }
        if (data.suggestedLocation) { next.location = data.suggestedLocation; }
        if (data.suggestedStartTime) {
          try {
            const d = new Date(data.suggestedStartTime);
            if (!isNaN(d.getTime())) {
              next.startDate = d.toISOString().slice(0, 10);
              next.startTime = d.toISOString().slice(11, 16);
            }
          } catch {}
        }
        if (Array.isArray(data.runOfShow)) {
          next.runOfShow = data.runOfShow.join('\n');
        }
        return next;
      });
      // Reset slug so it re-generates from new title
      setSlugEdited(false);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI fill failed. Try again.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.slug && !/^[a-z0-9-]+$/.test(form.slug)) {
      setSlugError('Only lowercase letters, numbers, and hyphens');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const body: Record<string, unknown> = {
        title: form.title,
        slug: form.slug || undefined,
        description: form.description || undefined,
        startAt: combineDatetime(form.startDate, form.startTime),
        endAt: combineDatetime(form.endDate, form.endTime) || undefined,
        location: form.location || undefined,
        heroImageAssetId: form.heroImageAssetId || undefined,
        capacity: form.capacity ? parseInt(form.capacity, 10) : undefined,
        accessMode: form.accessMode,
        approvalRequired: form.approvalRequired,
        plusOnesAllowed: form.plusOnesAllowed,
        showCapacity: form.showCapacity,
        status: form.status,
        runOfShow: form.runOfShow || undefined,
      };
      if (form.accessMode === 'TICKETED' || form.accessMode === 'APPLY_OR_PAY') {
        body.priceInCents = form.memberPrice ? Math.round(parseFloat(form.memberPrice) * 100) : undefined;
      }
      if (form.accessMode === 'APPLY_OR_PAY') {
        body.nonMemberPriceInCents = form.nonMemberPrice ? Math.round(parseFloat(form.nonMemberPrice) * 100) : undefined;
      }

      const res = await fetch('/api/operator/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Save failed (${res.status})`);
      }
      const { event } = await res.json();
      router.push(`/operator/events/${event.id}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Save failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const needsPrice = form.accessMode === 'TICKETED' || form.accessMode === 'APPLY_OR_PAY';

  return (
    <div className="px-4 pb-20 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/operator/events"
          className="mb-6 inline-block text-sm text-primary underline-offset-4 hover:underline"
        >
          ← All events
        </Link>

        <h1
          className="mb-8 text-3xl font-normal text-text-primary"
          style={{ fontFamily: 'var(--font-playfair-display), Georgia, serif' }}
        >
          New Event
        </h1>

        {/* AI Builder */}
        <div className="mb-8 rounded-lg bg-muted p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
            ✦ AI Event Builder
          </p>
          <textarea
            className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
            style={{ borderRadius: '6px' }}
            rows={3}
            placeholder="Describe your event concept..."
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
          />
          {aiError && <p className="mt-1 text-xs text-text-muted">{aiError}</p>}
          <button
            type="button"
            onClick={handleAiFill}
            disabled={aiLoading || !aiPrompt.trim()}
            className="mt-2 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
            style={{ borderRadius: '6px' }}
          >
            {aiLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {aiLoading ? 'Filling…' : '✦ Fill with AI'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Title <span className="text-text-muted">*</span>
            </label>
            <input
              required
              type="text"
              className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderRadius: '6px' }}
              value={form.title}
              onChange={e => set('title', e.target.value)}
            />
          </div>

          {/* Slug */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Slug
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderRadius: '6px' }}
              value={form.slug}
              onChange={e => handleSlugChange(e.target.value)}
            />
            {slugError && <p className="mt-1 text-xs text-text-muted">{slugError}</p>}
            {form.slug && !slugError && (
              <p className="mt-1 text-xs text-text-muted">
                /m/events/<span className="text-text-secondary">{form.slug}</span>
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Description
            </label>
            <textarea
              rows={5}
              className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderRadius: '6px' }}
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>

          {/* Start date + time */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Start date &amp; time <span className="text-text-muted">*</span>
            </label>
            <div className="flex gap-2">
              <input
                required
                type="date"
                className="flex-1 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderRadius: '6px' }}
                value={form.startDate}
                onChange={e => set('startDate', e.target.value)}
              />
              <input
                type="time"
                className="w-36 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderRadius: '6px' }}
                value={form.startTime}
                onChange={e => set('startTime', e.target.value)}
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
                value={form.endDate}
                onChange={e => set('endDate', e.target.value)}
              />
              <input
                type="time"
                className="w-36 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderRadius: '6px' }}
                value={form.endTime}
                onChange={e => set('endTime', e.target.value)}
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Venue / Location
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderRadius: '6px' }}
              value={form.location}
              onChange={e => set('location', e.target.value)}
            />
          </div>

          {/* Hero image URL */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Hero image URL
            </label>
            <input
              type="url"
              className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderRadius: '6px' }}
              placeholder="https://..."
              value={form.heroImageAssetId}
              onChange={e => set('heroImageAssetId', e.target.value)}
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
              className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderRadius: '6px' }}
              value={form.capacity}
              onChange={e => set('capacity', e.target.value)}
            />
          </div>

          {/* Access mode */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">
              Access mode
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
              {(['OPEN', 'TICKETED', 'APPLY_OR_PAY'] as const).map(mode => (
                <label key={mode} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                  <input
                    type="radio"
                    name="accessMode"
                    value={mode}
                    checked={form.accessMode === mode}
                    onChange={() => set('accessMode', mode)}
                    className="accent-primary"
                  />
                  {mode === 'OPEN' ? 'Open' : mode === 'TICKETED' ? 'Ticketed' : 'Apply or Pay'}
                </label>
              ))}
            </div>
          </div>

          {/* Member price */}
          {needsPrice && (
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Member price ($)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderRadius: '6px' }}
                placeholder="0.00"
                value={form.memberPrice}
                onChange={e => set('memberPrice', e.target.value)}
              />
            </div>
          )}

          {/* Non-member price */}
          {form.accessMode === 'APPLY_OR_PAY' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Non-member price ($)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderRadius: '6px' }}
                placeholder="0.00"
                value={form.nonMemberPrice}
                onChange={e => set('nonMemberPrice', e.target.value)}
              />
            </div>
          )}

          {/* Toggles */}
          <div className="space-y-3 rounded-lg border border-border p-4" style={{ borderRadius: '8px' }}>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-text-primary">
              <input
                type="checkbox"
                className="accent-primary h-4 w-4"
                checked={form.approvalRequired}
                onChange={e => set('approvalRequired', e.target.checked)}
              />
              Approval required
            </label>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-text-primary">
              <input
                type="checkbox"
                className="accent-primary h-4 w-4"
                checked={form.plusOnesAllowed}
                onChange={e => set('plusOnesAllowed', e.target.checked)}
              />
              Plus-ones allowed
            </label>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-text-primary">
              <input
                type="checkbox"
                className="accent-primary h-4 w-4"
                checked={form.showCapacity}
                onChange={e => set('showCapacity', e.target.checked)}
              />
              Show capacity to members
            </label>
          </div>

          {/* Run of show */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Run of show
            </label>
            <textarea
              rows={4}
              className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderRadius: '6px' }}
              placeholder="8:00 PM - Doors open&#10;9:00 PM - DJ set begins"
              value={form.runOfShow}
              onChange={e => set('runOfShow', e.target.value)}
            />
          </div>

          {/* Status */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">
              Status
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                <input
                  type="radio"
                  name="status"
                  value="DRAFT"
                  checked={form.status === 'DRAFT'}
                  onChange={() => set('status', 'DRAFT')}
                  className="accent-primary"
                />
                Save as Draft
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                <input
                  type="radio"
                  name="status"
                  value="PUBLISHED"
                  checked={form.status === 'PUBLISHED'}
                  onChange={() => set('status', 'PUBLISHED')}
                  className="accent-primary"
                />
                Publish immediately
              </label>
            </div>
          </div>

          {submitError && (
            <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-secondary">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity disabled:opacity-50"
            style={{ borderRadius: '6px' }}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Saving…' : 'Save Event'}
          </button>
        </form>
      </div>
    </div>
  );
}
