'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ChevronDown, Loader2, Sparkles } from 'lucide-react';

import { HeroImageUpload } from '../_components/HeroImageUpload';
import { AccessGroupsCard } from './_components/AccessGroupsCard';
import { TemplatePicker, type TemplateKey } from './_components/TemplatePicker';
import {
  WorkflowSection,
  DEFAULT_WORKFLOW_SELECTION,
  type WorkflowSelection,
} from './_components/WorkflowSection';
import { defaultEventAccess, type EventAccess } from '@/lib/event-access-schema';
import { newGate } from '@/lib/event-gates';
import { type AccessQuestion, toApiQuestion, coerceFieldType } from '@/lib/registration-fields';
import { logQAAction } from '@/lib/dev/qa-action-log';

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

const chrome = 'font-[family-name:var(--font-dm-sans)]';

function toKebab(str: string): string {
  return str.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
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
    <label className={`mb-1.5 block text-[11px] font-medium uppercase tracking-widest text-text-secondary ${chrome}`}>
      {children}
    </label>
  );
}

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-6">
      <h2 className={`text-[19px] font-semibold tracking-tight text-text-primary ${chrome}`}>{children}</h2>
      {sub ? <p className={`mt-1 text-[13px] text-text-secondary ${chrome}`}>{sub}</p> : null}
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <ol className="mb-9 flex flex-wrap items-center gap-1.5 sm:gap-2">
      {STEP_LABELS.map(({ step, label }, idx) => {
        const active = step === current;
        const done = step < current;
        return (
          <li key={step} className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold ${chrome} ${
                active ? 'border-primary bg-primary text-on-primary'
                  : done ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border bg-card text-text-tertiary'
              }`}
              aria-current={active ? 'step' : undefined}
            >
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : step}
            </span>
            <span className={`hidden text-[11px] font-medium uppercase tracking-widest sm:inline ${chrome} ${active ? 'text-text-primary' : 'text-text-tertiary'}`}>
              {label}
            </span>
            {idx < STEP_LABELS.length - 1 ? (
              <span className="mx-1 hidden h-px w-6 bg-border md:inline-block" aria-hidden />
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
      className={`w-full rounded-[8px] border border-border bg-card px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary transition-colors focus:border-primary focus:bg-surface focus:outline-none ${chrome} ${className}`}
    />
  );
}

function PrimaryButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`btn-shimmer inline-flex items-center justify-center gap-2 rounded-[8px] bg-primary px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50 ${chrome} ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-[8px] border border-border bg-card px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-text-primary transition-colors hover:border-border-strong hover:text-primary disabled:opacity-50 ${chrome} ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}

const INITIAL_FORM: FormState = {
  title: '', slug: '', description: '',
  startDate: '', startTime: '', endDate: '', endTime: '',
  location: '', heroImageUrl: '', capacity: '',
};

export default function NewEventPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [slugEdited, setSlugEdited] = useState(false);
  const [access, setAccess] = useState<EventAccess>(() => defaultEventAccess());
  const [workflow, setWorkflow] = useState<WorkflowSelection>(DEFAULT_WORKFLOW_SELECTION);
  const [questions, setQuestions] = useState<AccessQuestion[]>([]);
  const [template, setTemplate] = useState<TemplateKey>('editorial');

  // AI builder
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiExpanded, setAiExpanded] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiFilled, setAiFilled] = useState(false);
  const [highlightFields, setHighlightFields] = useState(false);

  const [flowTemplates, setFlowTemplates] = useState<FlowTemplate[]>([]);
  const [appliedTemplate, setAppliedTemplate] = useState<FlowTemplate | null>(null);

  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!slugEdited && form.title) {
      setForm(prev => ({ ...prev, slug: toKebab(prev.title) }));
    }
  }, [form.title, slugEdited]);

  useEffect(() => {
    if (!highlightFields) return;
    const t = window.setTimeout(() => setHighlightFields(false), 1600);
    return () => window.clearTimeout(t);
  }, [highlightFields]);

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
        accessMode?: 'OPEN' | 'TICKETED';
        template?: TemplateKey;
      };

      setForm(prev => {
        const next = { ...prev };
        if (data.title) next.title = data.title;
        if (data.slug) { next.slug = data.slug; } else if (data.title) { next.slug = toKebab(data.title); }
        if (data.description) next.description = data.description;
        if (data.startDatetime) { const p = parseIsoToDateTime(data.startDatetime); if (p) { next.startDate = p.date; next.startTime = p.time; } }
        if (data.endDatetime) { const p = parseIsoToDateTime(data.endDatetime); if (p) { next.endDate = p.date; next.endTime = p.time; } }
        if (data.venue) next.location = data.venue;
        if (data.capacity != null) next.capacity = String(data.capacity);
        return next;
      });
      if (data.slug) setSlugEdited(true);

      if (data.accessMode === 'TICKETED') {
        setAccess({
          member: { enabled: true, gates: [newGate('ticket')], priceCents: 0 },
          guest: { enabled: true, gates: [newGate('ticket')], priceCents: 0 },
          comp: { enabled: false, budgetCap: null },
        });
      } else {
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
        member: { enabled: true, gates: approved ? [newGate('application')] : [], priceCents: 0 },
        guest: { enabled: false, gates: [], priceCents: 0 },
        comp: { enabled: false, budgetCap: null },
      });
    } else if (t.accessMode === 'TICKETED') {
      setAccess({
        member: { enabled: true, gates: memberPrice > 0 ? [newGate('ticket')] : [], priceCents: memberPrice },
        guest: { enabled: guestPrice > 0, gates: [newGate('ticket')], priceCents: guestPrice },
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
    if (!form.title.trim()) { setSubmitError('Title is required.'); return; }
    const startAt = combineDatetime(form.startDate, form.startTime);
    if (!startAt) { setSubmitError('Start date is required.'); return; }
    if (form.slug && !/^[a-z0-9-]+$/.test(form.slug)) { setSubmitError('Slug must be lowercase letters, numbers, and hyphens.'); return; }

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
        workflow,
        ...(appliedTemplate && { plusOnesAllowed: appliedTemplate.plusOnesAllowed, showCapacity: appliedTemplate.showCapacity }),
        ...(questions.length > 0 && { customQuestions: questions.map(toApiQuestion) }),
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
      logQAAction(`created event (status=${status})`);
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
  const flashCls = highlightFields ? 'ring-2 ring-[var(--primary-soft)]' : '';
  const heroEnvelopeClass = useMemo(
    () => `transition-shadow duration-500 rounded-[8px] ${highlightFields ? 'ring-2 ring-[var(--primary-soft)]' : ''}`,
    [highlightFields],
  );

  return (
    <div className="min-h-screen overflow-x-hidden px-6 py-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full">
        <Link href="/operator/events"
          className={`mb-6 inline-block text-[11px] font-medium uppercase tracking-widest text-text-secondary transition-colors hover:text-primary ${chrome}`}>
          ← All events
        </Link>

        <h1 className={`mb-7 text-[24px] font-semibold tracking-tight text-text-primary ${chrome}`}>
          New Event
        </h1>

        <StepIndicator current={step} />

        {step === 1 && (
          <section key="s1" className="page-fade-in">
            <SectionTitle sub="Describe your event and AI fills the form — or start from scratch.">
              Start a draft
            </SectionTitle>

            <div className="rounded-[10px] border border-border bg-card op-card">
              <div className="flex items-center gap-2 px-4 py-3">
                <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleAiGenerate(); }}
                  placeholder="A late summer rooftop dinner for 24…"
                  className={`min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none ${chrome}`}
                />
                <button type="button" onClick={() => setAiExpanded(v => !v)} aria-label={aiExpanded ? 'Collapse' : 'Expand'}
                  className="icon-btn shrink-0 text-text-tertiary hover:text-primary">
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${aiExpanded ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {aiExpanded && (
                <div className="page-fade-in border-t border-border px-4 py-3">
                  <textarea rows={4} value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                    placeholder="A late summer rooftop dinner for 24 — long shared table, natural wine pairings, a chef from Saigon for one night only…"
                    className={`w-full resize-none rounded-[8px] border border-border bg-surface p-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none ${chrome}`}
                  />
                </div>
              )}
            </div>

            {aiError ? <p role="alert" className={`mt-3 text-sm text-danger ${chrome}`}>{aiError}</p> : null}

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <PrimaryButton type="button" onClick={handleAiGenerate} disabled={aiLoading || !aiPrompt.trim()}>
                {aiLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Thinking…</> : <><Sparkles className="h-4 w-4" />Generate →</>}
              </PrimaryButton>
              <button type="button" onClick={handleStartFromScratch}
                className={`text-[12px] font-medium uppercase tracking-widest text-text-secondary transition-colors hover:text-primary ${chrome}`}>
                Start from scratch →
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section key="s2" className="page-fade-in">
            <SectionTitle>Details</SectionTitle>

            <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
              {/* Left column */}
              <div className="flex flex-col gap-5">
                <div className={flashCls + ' rounded-[8px]'}>
                  <FieldLabel>Title *</FieldLabel>
                  <TextInput required type="text" value={form.title} onChange={e => set('title', e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Slug</FieldLabel>
                  <TextInput type="text" value={form.slug} onChange={e => handleSlugChange(e.target.value)} className="font-mono" />
                  {form.slug ? <p className={`mt-1 text-[11px] text-text-tertiary ${chrome}`}>/m/events/{form.slug}</p> : null}
                </div>
                <div className={flashCls + ' rounded-[8px]'}>
                  <FieldLabel>Description</FieldLabel>
                  <textarea rows={8} value={form.description} onChange={e => set('description', e.target.value)}
                    className={`w-full resize-none rounded-[8px] border border-border bg-card px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:bg-surface focus:outline-none ${chrome}`}
                  />
                </div>
              </div>

              {/* Right column */}
              <div className="flex flex-col gap-5">
                <div>
                  <FieldLabel>Start date &amp; time *</FieldLabel>
                  <div className="flex gap-2">
                    <TextInput type="date" required value={form.startDate} onChange={e => set('startDate', e.target.value)} className="flex-1 min-w-0" />
                    <TextInput type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)} className="w-32 shrink-0" />
                  </div>
                </div>
                <div>
                  <FieldLabel>End date &amp; time (optional)</FieldLabel>
                  <div className="flex gap-2">
                    <TextInput type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} className="flex-1 min-w-0" />
                    <TextInput type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)} className="w-32 shrink-0" />
                  </div>
                </div>
                <div className={flashCls + ' rounded-[8px]'}>
                  <FieldLabel>Venue / Location</FieldLabel>
                  <TextInput type="text" value={form.location} onChange={e => set('location', e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Capacity (optional)</FieldLabel>
                  <TextInput type="number" min={1} value={form.capacity} onChange={e => set('capacity', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Hero — full width */}
            <div className={`mt-6 ${heroEnvelopeClass}`}>
              <FieldLabel>Hero Image</FieldLabel>
              <HeroImageUpload value={form.heroImageUrl} onChange={url => set('heroImageUrl', url)} compact />
            </div>
          </section>
        )}

        {step === 3 && (
          <section key="s3" className="page-fade-in">
            <SectionTitle sub="How do people get in?">Access</SectionTitle>

            {flowTemplates.length > 0 && (
              <div className="mb-6 space-y-3">
                <p className={`text-[11px] font-medium uppercase tracking-widest text-text-secondary ${chrome}`}>
                  Start from a saved flow
                </p>
                <div className="flex flex-wrap gap-2">
                  {flowTemplates.map(t => (
                    <button key={t.id} type="button" onClick={() => applyFlowTemplate(t)}
                      className={`flex flex-col items-start rounded-[8px] border px-4 py-3 text-left transition-colors ${
                        appliedTemplate?.id === t.id ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:border-border-strong'
                      }`}>
                      <span className={`text-sm font-medium text-text-primary ${chrome}`}>{t.name}</span>
                      <span className={`mt-0.5 text-xs text-text-secondary ${chrome}`}>
                        {flowTemplateLabel(t.accessMode, t.applyMode)}
                        {t.customQuestions.length > 0 ? ` · ${t.customQuestions.length}q` : ''}
                      </span>
                    </button>
                  ))}
                </div>
                {appliedTemplate && (
                  <p className={`text-[11px] text-text-tertiary ${chrome}`}>Template applied — adjust below if needed.</p>
                )}
              </div>
            )}

            <div className="mb-8 rounded-[10px] border border-border bg-card p-5">
              <WorkflowSection value={workflow} onChange={setWorkflow} />
            </div>

            <AccessGroupsCard value={access} onChange={setAccess} questions={questions} onQuestionsChange={setQuestions} eventTitle={form.title} />
          </section>
        )}

        {step === 4 && (
          <section key="s4" className="page-fade-in">
            <SectionTitle sub="Pick the layout for the member-facing event page.">Template</SectionTitle>
            <TemplatePicker value={template} onChange={setTemplate} />
          </section>
        )}

        {submitError ? (
          <p role="alert" className={`mt-6 rounded-[8px] border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger ${chrome}`}>
            {submitError}
          </p>
        ) : null}

        {/* Nav */}
        <div className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <div>
            {step > 1 ? (
              <GhostButton type="button" onClick={() => setStep(prev => (Math.max(1, prev - 1) as Step))}>← Back</GhostButton>
            ) : <span />}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {step >= 2 ? (
              <GhostButton type="button" onClick={() => void submitForm('DRAFT')} disabled={savingDraft || submitting}>
                {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save as Draft
              </GhostButton>
            ) : null}

            {step === 1 && <PrimaryButton type="button" onClick={() => setStep(2)} disabled={!canAdvanceFromStep1}>Next →</PrimaryButton>}
            {step === 2 && <PrimaryButton type="button" onClick={() => setStep(3)} disabled={!canAdvanceFromStep2}>Next →</PrimaryButton>}
            {step === 3 && <PrimaryButton type="button" onClick={() => { setToast('Flow saved ✓'); setStep(4); }}>Next →</PrimaryButton>}
            {step === 4 && (
              <PrimaryButton type="button" onClick={() => void submitForm('PUBLISHED')} disabled={submitting || savingDraft}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Publish
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>
      {toast && <FlowToast message={toast} />}
    </div>
  );
}

function FlowToast({ message }: { message: string }) {
  return (
    <div role="status" className="toast-in fixed bottom-6 right-6 z-50 overflow-hidden rounded-[8px] bg-text-primary px-4 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.25)]">
      <span className={`text-[12px] font-medium text-[var(--bg)] ${chrome}`}>{message}</span>
      <span className="toast-progress absolute bottom-0 left-0 h-0.5 w-full bg-primary" />
    </div>
  );
}
