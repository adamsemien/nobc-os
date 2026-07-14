'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Eye, HelpCircle } from 'lucide-react';

function HelpTipInline({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-text-muted"
        aria-label="More info"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-10 mt-1.5 w-56 -translate-x-1/2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs leading-snug text-text-primary shadow-md"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

export type TemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  variables: unknown;
  enabled: boolean;
  updatedAt: string;
};

export type SettingRow = {
  id: string;
  key: string;
  value: string;
  type: 'boolean' | 'time' | 'text' | string;
  description: string | null;
};

function variableList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

export function CommunicationsEditor({
  initialTemplates,
  initialSettings,
}: {
  initialTemplates: TemplateRow[];
  initialSettings: SettingRow[];
}) {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          Email templates
        </h2>
        <div className="space-y-3">
          {initialTemplates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-sm text-text-muted">
              No templates seeded yet. Reload this page to seed the defaults.
            </p>
          ) : (
            initialTemplates.map((t) => <TemplateCard key={t.id} initial={t} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          Auto-notifications
        </h2>
        <div className="space-y-3">
          {initialSettings.map((s) => <SettingRowEditor key={s.id} initial={s} />)}
        </div>
      </section>
    </div>
  );
}

function TemplateCard({ initial }: { initial: TemplateRow }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [subject, setSubject] = useState(initial.subject);
  const [bodyHtml, setBodyHtml] = useState(initial.bodyHtml);
  const [bodyText, setBodyText] = useState(initial.bodyText);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const vars = useMemo(() => variableList(initial.variables), [initial.variables]);

  async function save(next: Partial<{ enabled: boolean; subject: string; bodyHtml: string; bodyText: string }>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/operator/settings/communications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: initial.id,
          subject: next.subject ?? subject,
          bodyHtml: next.bodyHtml ?? bodyHtml,
          bodyText: next.bodyText ?? bodyText,
          enabled: next.enabled ?? enabled,
        }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof error === 'string' ? error : 'Could not save');
      }
      setSavedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  function insertVariable(varName: string, target: 'subject' | 'html' | 'text') {
    const token = `{{${varName}}}`;
    if (target === 'subject') setSubject((s) => s + token);
    else if (target === 'html') setBodyHtml((s) => s + token);
    else setBodyText((s) => s + token);
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{initial.name}</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-text-muted">{initial.key}</code>
            {enabled ? (
              <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-success">
                on
              </span>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-text-muted">
                off
              </span>
            )}
          </div>
          {initial.description ? (
            <p className="mt-0.5 text-xs text-text-muted">{initial.description}</p>
          ) : null}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border p-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                void save({ enabled: e.target.checked });
              }}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-text-primary">Enabled</span>
            <HelpTipInline>
              When off, this template never sends — the platform skips it and writes an
              email.skipped row to the audit log.
            </HelpTipInline>
          </label>

          <Field label="Subject">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </Field>

          <Field label="HTML body">
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </Field>

          <Field label="Plain text body">
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </Field>

          {vars.length > 0 ? (
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-[0.08em] font-medium text-text-secondary">
                Variables — click to insert
              </div>
              <div className="flex flex-wrap gap-1.5">
                {vars.map((v) => (
                  <div key={v} className="flex items-center gap-1 rounded border border-border bg-muted/30 px-2 py-1 text-[11px] text-text-secondary">
                    <code className="font-mono">{`{{${v}}}`}</code>
                    <span className="opacity-50">·</span>
                    <button
                      type="button"
                      onClick={() => insertVariable(v, 'subject')}
                      className="hover:text-primary"
                    >
                      subj
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable(v, 'html')}
                      className="hover:text-primary"
                    >
                      html
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable(v, 'text')}
                      className="hover:text-primary"
                    >
                      text
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPreviewOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-primary hover:border-primary hover:text-primary"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
                {previewOpen ? 'Hide preview' : 'Preview'}
              </button>
              <div className="text-xs text-text-muted">
                {error ? (
                  <span className="text-danger">{error}</span>
                ) : savedAt ? (
                  `Saved ${savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                ) : (
                  ''
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => save({})}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>

          {previewOpen ? (
            <div className="rounded-md border border-border bg-page p-4">
              <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-text-muted">Subject</div>
              <p className="mb-4 text-sm font-medium text-text-primary">{subject}</p>
              <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-text-muted">Preview</div>
              <div className="prose prose-sm max-w-none text-sm text-text-primary" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SettingRowEditor({ initial }: { initial: SettingRow }) {
  const [value, setValue] = useState(initial.value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/operator/settings/platform', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: initial.key, value: next }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof error === 'string' ? error : 'Could not save');
      }
      setValue(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">{initial.key}</span>
          {saving ? <span className="text-[10px] text-text-muted">saving…</span> : null}
        </div>
        {initial.description ? (
          <p className="mt-0.5 text-xs text-text-muted">{initial.description}</p>
        ) : null}
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
      <div className="shrink-0">
        {initial.type === 'boolean' ? (
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value === 'true'}
              onChange={(e) => save(e.target.checked ? 'true' : 'false')}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-text-primary">{value === 'true' ? 'On' : 'Off'}</span>
          </label>
        ) : initial.type === 'time' ? (
          <input
            type="time"
            value={value}
            onChange={(e) => save(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary focus:border-primary focus:outline-none"
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => save(value)}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary focus:border-primary focus:outline-none"
          />
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-text-secondary mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
