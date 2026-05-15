'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Loader2, Sparkles } from 'lucide-react';

import { HeroImageUpload } from './_components/HeroImageUpload';
import { AccessGroupsCard } from './_components/AccessGroupsCard';
import { TemplatePicker, type TemplateKey } from './_components/TemplatePicker';
import { defaultEventAccess, type EventAccess } from '@/lib/event-access-schema';
import {
  type AccessQuestion,
  toApiQuestion,
  coerceFieldType,
} from '@/lib/registration-fields';

type FlowTemplate = {
  id: string;
  name: string;
  accessMode: string;
  applyMode: string | null;
  priceInCents: number | null;
  nonMemberPriceInCents: number | null;
  approvalRequired: boolean;
  plusOnesAllowed: boolean;
  showCapacity: boolean;
  customQuestions: Array<{ label: string; type: string; required: boolean; options: string[] }>;
};

type Step = 1 | 2 | 3 | 4;

type FormState = {
  title: string;
  slug: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  heroImageUrl: string;
  capacity: string;
};

const STEP_LABELS: Array<{ step: Step; label: string }> = [
  { step: 1, label: 'Draft' },
  { step: 2, label: 'Details' },
  { step: 3, label: 'Access' },
  { step: 4, label: 'Template' },
];

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

function parseIsoToDateTime(iso: string): { date: string; time: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
      {children}
    </label>
  );
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <ol className="mb-10 flex items-center gap-2 sm:gap-4">
      {STEP_LABELS.map(({ step, label }, idx) => {
        const active = step === current;
        const done = step < current;
        return (
          <li key={step} className="flex items-center gap-2 sm:gap-3">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-medium font-[family-name:var(--font-dm-sans)] ${
                active
                  ? 'border-[var(--nobc-red)] bg-[var(--nobc-red)] text-[var(--nobc-on-red)]'
                  : done
                    ? 'border-[var(--apply-rule)] bg-[#F9F7F2] text-[var(--apply-ink)]'
                    : 'border-[var(--apply-rule)] bg-white text-[var(--apply-muted)]'
              }`}
              aria-current={active ? 'step' : undefined}
            >
              {done ? <Check className="h-3 w-3" strokeWidth={2.5} /> : step}
            </span>
            <span
              className={`text-[11px] uppercase tracking-widest font-[family-name:var(--font-dm-sans)] ${
                active ? 'text-[var(--apply-ink)]' : 'text-[var(--apply-muted)]'
              }`}
            >
              {label}
            </span>
            {idx < STEP_LABELS.length - 1 ? (
              <span className="hidden h-px w-6 bg-[var(--apply-rule)] sm:inline-block" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-sm border border-[var(--apply-rule)] bg-white px-3 py-2 text-sm text-[var(--apply-ink)] placeholder:text-[var(--apply-muted)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)] ${className}`}
    />
  );
}

function PrimaryButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-sm bg-[var(--nobc-red)] px-5 py-2.5 text-[11px] font-medium uppercase tracking-widest text-[var(--nobc-on-red)] transition-colors hover:bg-[color-mix(in_oklab,var(--nobc-red)_86%,black)] disabled:opacity-60 font-[family-name:var(--font-dm-sans)] ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-sm border border-[var(--apply-rule)] bg-white px-5 py-2.5 text-[11px] font-medium uppercase tracking-widest text-[var(--apply-ink)] transition-colors hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)] disabled:opacity-50 font-[family-name:var(--font-dm-sans)] ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}

const INITIAL_FORM: FormState = {
  title: '',
  slug: '',
  description: '',
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  location: '',
  heroImageUrl: '',
  capacity: '',
};

export default function NewEventPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [slugEdited, setSlugEdited] = useState(false);
  const [access, setAccess] = useState<EventAccess>(() => defaultEventAccess());
  const [questions, setQuestions] = useState<AccessQuestion[]>([]);
  const [template, setTemplate] = useState<TemplateKey>('editorial');

  // AI builder state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiFilled, setAiFilled] = useState(false);
  const [highlightFields, setHighlightFields] = useState(false);

  const [flowTemplates, setFlowTemplates] = useState<FlowTemplate[]>([]);
  const [appliedTemplate, setAppliedTemplate] = useState<FlowTemplate | null>(null);

  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Auto-generate slug from title until user edits it
  useEffect(() => {
    if (!slugEdited && form.title) {
      setForm(prev => ({ ...prev, slug: toKebab(prev.title) }));
    }
  }, [form.title, slugEdited]);

  // Clear field flash after a moment
  useEffect(() => {
    if (!highlightFields) return;
    const t = window.setTimeout(() => setHighlightFields(false), 1600);
    return () => window.clearTimeout(t);
  }, [highlightFields]);

  // Fetch saved flow templates when entering Step 3
  useEffect(() => {
    if (step !== 3) return;
    fetch('/api/operator/event-flow-templates', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { templates: [] })
      .then((d: { templates?: FlowTemplate[] }) => setFlowTemplates(d.templates ?? []))
      .catch(() => {});
  }, [step]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleSlugChange(val: string) {
    setSlugEdited(true);
    set('slug', val);
  }

  async function handleAiGenerate() {
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
      const data = (await res.json()) as {
        title?: string;
        slug?: string;
        description?: string;
        startDatetime?: string;
        endDatetime?: string;
        venue?: string;
        capacity?: number;
        accessMode?: 'OPEN' | 'TICKETED' | 'APPLY_OR_PAY';
        template?: TemplateKey;
      };

      setForm(prev => {
        const next = { ...prev };
        if (data.title) next.title = data.title;
        if (data.slug) {
          next.slug = data.slug;
        } else if (data.title) {
          next.slug = toKebab(data.title);
        }
        if (data.description) next.description = data.description;
        if (data.startDatetime) {
          const parsed = parseIsoToDateTime(data.startDatetime);
          if (parsed) {
            next.startDate = parsed.date;
            next.startTime = parsed.time;
          }
        }
        if (data.endDatetime) {
          const parsed = parseIsoToDateTime(data.endDatetime);
          if (parsed) {
            next.endDate = parsed.date;
            next.endTime = parsed.time;
          }
        }
        if (data.venue) next.location = data.venue;
        if (data.capacity != null) next.capacity = String(data.capacity);
        return next;
      });
      if (data.slug) setSlugEdited(true);

      // Map accessMode → EventAccess roughly
      if (data.accessMode === 'TICKETED') {
        setAccess({
          member: { enabled: true, gate: 'pay', priceCents: 0 },
          guest: { enabled: true, gate: 'pay', priceCents: 0 },
          comp: { enabled: false, budgetCap: null },
        });
      } else if (data.accessMode === 'APPLY_OR_PAY') {
        setAccess({
          member: { enabled: true, gate: 'questions_approval', priceCents: 0 },
          guest: { enabled: true, gate: 'pay', priceCents: 0 },
          comp: { enabled: false, budgetCap: null },
        });
      } else if (data.accessMode === 'OPEN') {
        setAccess(defaultEventAccess());
      }

      if (data.template) setTemplate(data.template);

      setAiFilled(true);
      setHighlightFields(true);
      setStep(2);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI generation failed. Try again.');
    } finally {
      setAiLoading(false);
    }
  }

  function handleStartFromScratch() {
    setAiFilled(true);
    setStep(2);
  }

  function applyFlowTemplate(t: FlowTemplate) {
    setAppliedTemplate(t);
    const memberPrice = t.priceInCents ?? 0;
    const guestPrice = t.nonMemberPriceInCents ?? 0;
    const approved = t.approvalRequired;

    if (t.accessMode === 'OPEN') {
      setAccess({
        member: { enabled: true, gate: approved ? 'questions_approval' : 'auto_confirm', priceCents: 0 },
        guest: { enabled: false, gate: 'pay', priceCents: 0 },
        comp: { enabled: false, budgetCap: null },
      });
    } else if (t.accessMode === 'TICKETED') {
      setAccess({
        member: { enabled: true, gate: memberPrice > 0 ? 'pay' : 'auto_confirm', priceCents: memberPrice },
        guest: { enabled: guestPrice > 0, gate: 'pay', priceCents: guestPrice },
        comp: { enabled: false, budgetCap: null },
      });
    } else if (t.accessMode === 'APPLY_OR_PAY') {
      setAccess({
        member: { enabled: true, gate: approved ? 'questions_approval' : 'auto_confirm', priceCents: 0 },
        guest: { enabled: true, gate: approved ? 'apply' : 'pay', priceCents: guestPrice },
        comp: { enabled: false, budgetCap: null },
      });
    } else {
      setAccess(defaultEventAccess());
    }

    setQuestions(
      t.customQuestions.map((q, i) => ({
        tempId: `tpl-${i}-${Date.now()}`,
        label: q.label,
        type: coerceFieldType(q.type),
        required: q.required,
        options: q.options ?? [],
        showTo: 'both' as const,
      })),
    );
  }

  function flowTemplateLabel(accessMode: string, applyMode: string | null): string {
    if (accessMode === 'OPEN') return 'RSVP (Free)';
    if (accessMode === 'TICKETED') return 'Paid Ticket';
    if (accessMode === 'APPLY_OR_PAY' && applyMode === 'APPROVAL_HOLDS_TICKET') return 'Members Apply / Others Pay';
    if (accessMode === 'APPLY_OR_PAY') return 'Application Only';
    return accessMode;
  }

  async function submitForm(status: 'DRAFT' | 'PUBLISHED') {
    if (!form.title.trim()) {
      setSubmitError('Title is required.');
      return;
    }
    const startAt = combineDatetime(form.startDate, form.startTime);
    if (!startAt) {
      setSubmitError('Start date is required.');
      return;
    }
    if (form.slug && !/^[a-z0-9-]+$/.test(form.slug)) {
      setSubmitError('Slug must be lowercase letters, numbers, and hyphens.');
      return;
    }

    setSubmitError('');
    if (status === 'DRAFT') setSavingDraft(true);
    else setSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        title: form.title,
        slug: form.slug || toKebab(form.title),
        description: form.description || undefined,
        startAt,
        endAt: combineDatetime(form.endDate, form.endTime) || undefined,
        location: form.location || undefined,
        heroImageAssetId: form.heroImageUrl || undefined,
        capacity: form.capacity ? parseInt(form.capacity, 10) : undefined,
        template,
        status,
        eventAccess: access,
        ...(appliedTemplate && {
          plusOnesAllowed: appliedTemplate.plusOnesAllowed,
          showCapacity: appliedTemplate.showCapacity,
        }),
        ...(questions.length > 0 && {
          customQuestions: questions.map(toApiQuestion),
        }),
      };

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
      const { event } = (await res.json()) as { event: { id: string } };
      router.push(`/operator/events/${event.id}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Save failed. Try again.');
    } finally {
      setSavingDraft(false);
      setSubmitting(false);
    }
  }

  const canAdvanceFromStep1 = aiFilled;
  const canAdvanceFromStep2 = !!form.title.trim() && !!form.startDate;
  const flashCls = highlightFields ? 'ring-2 ring-[var(--nobc-red)]/30' : '';

  const heroEnvelopeClass = useMemo(
    () =>
      `transition-shadow duration-500 rounded-sm ${highlightFields ? 'ring-2 ring-[var(--nobc-red)]/30' : ''}`,
    [highlightFields],
  );

  return (
    <div className="min-h-screen bg-[#F9F7F2] px-4 pb-24 pt-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/operator/events"
          className="mb-8 inline-block text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] hover:text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
        >
          ← All events
        </Link>

        <h1 className="mb-8 text-[40px] font-normal leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
          New Event
        </h1>

        <StepIndicator current={step} />

        {step === 1 && (
          <section className="space-y-6">
            <div>
              <h2 className="text-[36px] font-normal leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
                Start with AI
              </h2>
              <p className="mt-2 text-sm text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                Describe your event in plain language. AI fills the form.
              </p>
            </div>

            <textarea
              rows={4}
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder="A late summer rooftop dinner for 24 — long shared table, natural wine pairings, a chef from Saigon for one night only..."
              className="w-full rounded-sm border border-[var(--apply-rule)] bg-white p-4 text-sm text-[var(--apply-ink)] placeholder:text-[var(--apply-muted)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
            />

            {aiError ? (
              <p role="alert" className="text-sm text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
                {aiError}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-4">
              <PrimaryButton
                type="button"
                onClick={handleAiGenerate}
                disabled={aiLoading || !aiPrompt.trim()}
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate →
                  </>
                )}
              </PrimaryButton>

              <button
                type="button"
                onClick={handleStartFromScratch}
                className="text-[12px] uppercase tracking-widest text-[var(--apply-muted)] hover:text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
              >
                Start from scratch →
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-6">
            <h2 className="text-[32px] font-normal leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
              Details
            </h2>

            <div className={flashCls + ' rounded-sm'}>
              <FieldLabel>Title *</FieldLabel>
              <TextInput
                required
                type="text"
                value={form.title}
                onChange={e => set('title', e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Slug</FieldLabel>
              <TextInput
                type="text"
                value={form.slug}
                onChange={e => handleSlugChange(e.target.value)}
                className="font-mono"
              />
              {form.slug ? (
                <p className="mt-1 text-[11px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                  /m/events/{form.slug}
                </p>
              ) : null}
            </div>

            <div className={flashCls + ' rounded-sm'}>
              <FieldLabel>Description</FieldLabel>
              <textarea
                rows={6}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                className="w-full rounded-sm border border-[var(--apply-rule)] bg-white px-3 py-2 text-sm text-[var(--apply-ink)] placeholder:text-[var(--apply-muted)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
              />
            </div>

            <div>
              <FieldLabel>Start date &amp; time *</FieldLabel>
              <div className="flex gap-2">
                <TextInput
                  type="date"
                  required
                  value={form.startDate}
                  onChange={e => set('startDate', e.target.value)}
                  className="flex-1"
                />
                <TextInput
                  type="time"
                  value={form.startTime}
                  onChange={e => set('startTime', e.target.value)}
                  className="w-36"
                />
              </div>
            </div>

            <div>
              <FieldLabel>End date &amp; time (optional)</FieldLabel>
              <div className="flex gap-2">
                <TextInput
                  type="date"
                  value={form.endDate}
                  onChange={e => set('endDate', e.target.value)}
                  className="flex-1"
                />
                <TextInput
                  type="time"
                  value={form.endTime}
                  onChange={e => set('endTime', e.target.value)}
                  className="w-36"
                />
              </div>
            </div>

            <div className={flashCls + ' rounded-sm'}>
              <FieldLabel>Venue / Location</FieldLabel>
              <TextInput
                type="text"
                value={form.location}
                onChange={e => set('location', e.target.value)}
              />
            </div>

            <div className={heroEnvelopeClass}>
              <FieldLabel>Hero Image</FieldLabel>
              <HeroImageUpload
                value={form.heroImageUrl}
                onChange={url => set('heroImageUrl', url)}
              />
            </div>

            <div>
              <FieldLabel>Capacity (optional)</FieldLabel>
              <TextInput
                type="number"
                min={1}
                value={form.capacity}
                onChange={e => set('capacity', e.target.value)}
              />
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-6">
            <h2 className="text-[32px] font-normal leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
              Access
            </h2>
            <p className="text-sm text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              How do people get in?
            </p>

            {flowTemplates.length > 0 && (
              <div className="space-y-3">
                <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                  Start from a saved flow
                </p>
                <div className="flex flex-wrap gap-2">
                  {flowTemplates.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyFlowTemplate(t)}
                      className={`flex flex-col items-start rounded-sm border px-4 py-3 text-left transition-colors ${
                        appliedTemplate?.id === t.id
                          ? 'border-[var(--nobc-red)] bg-[#F9F7F2]'
                          : 'border-[var(--apply-rule)] bg-white hover:border-[var(--nobc-red)]'
                      }`}
                    >
                      <span className="text-sm font-medium text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                        {t.name}
                      </span>
                      <span className="mt-0.5 text-xs text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                        {flowTemplateLabel(t.accessMode, t.applyMode)}
                        {t.customQuestions.length > 0
                          ? ` · ${t.customQuestions.length}q`
                          : ''}
                      </span>
                    </button>
                  ))}
                </div>
                {appliedTemplate && (
                  <p className="text-[11px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                    Template applied — adjust settings below if needed.
                  </p>
                )}
                <div className="border-t border-[var(--apply-rule)]" />
              </div>
            )}

            <AccessGroupsCard
              value={access}
              onChange={setAccess}
              questions={questions}
              onQuestionsChange={setQuestions}
            />
          </section>
        )}

        {step === 4 && (
          <section className="space-y-6">
            <h2 className="text-[32px] font-normal leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
              Template
            </h2>
            <p className="text-sm text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              Pick the layout for the member-facing event page.
            </p>
            <TemplatePicker value={template} onChange={setTemplate} />
          </section>
        )}

        {submitError ? (
          <p
            role="alert"
            className="mt-6 rounded-sm border border-[var(--apply-rule)] bg-white px-4 py-3 text-sm text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
          >
            {submitError}
          </p>
        ) : null}

        {/* Nav */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
          <div>
            {step > 1 ? (
              <GhostButton
                type="button"
                onClick={() => setStep(prev => (Math.max(1, prev - 1) as Step))}
              >
                ← Back
              </GhostButton>
            ) : (
              <span />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {step >= 2 ? (
              <GhostButton
                type="button"
                onClick={() => void submitForm('DRAFT')}
                disabled={savingDraft || submitting}
              >
                {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save as Draft
              </GhostButton>
            ) : null}

            {step === 1 && (
              <PrimaryButton
                type="button"
                onClick={() => setStep(2)}
                disabled={!canAdvanceFromStep1}
              >
                Next →
              </PrimaryButton>
            )}
            {step === 2 && (
              <PrimaryButton
                type="button"
                onClick={() => setStep(3)}
                disabled={!canAdvanceFromStep2}
              >
                Next →
              </PrimaryButton>
            )}
            {step === 3 && (
              <PrimaryButton type="button" onClick={() => setStep(4)}>
                Next →
              </PrimaryButton>
            )}
            {step === 4 && (
              <PrimaryButton
                type="button"
                onClick={() => void submitForm('PUBLISHED')}
                disabled={submitting || savingDraft}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Publish
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

