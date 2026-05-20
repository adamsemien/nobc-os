'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { WORKFLOW_TEMPLATES, type WorkflowTemplateConfig, buildPathsFromTemplate } from '@/lib/workflows/templates';
import { renderWorkflowSummary } from '@/lib/workflows/render';
import type { WorkflowTemplateKey } from '@/lib/workflows/types';
import { HelpTip } from '../../../_components/Tooltip';
import type { TierRow } from '@/app/api/operator/tiers/route';

export type WorkflowSelection = {
  templateKey: WorkflowTemplateKey;
  config: WorkflowTemplateConfig;
};

export const DEFAULT_WORKFLOW_SELECTION: WorkflowSelection = {
  templateKey: 'open',
  config: {},
};

const chrome = 'font-[family-name:var(--font-dm-sans)]';

export function WorkflowSection({
  value,
  onChange,
}: {
  value: WorkflowSelection;
  onChange: (next: WorkflowSelection) => void;
}) {
  const paths = useMemo(
    () => buildPathsFromTemplate(value.templateKey, value.config),
    [value.templateKey, value.config],
  );
  const summary = useMemo(() => renderWorkflowSummary(paths), [paths]);

  function selectTemplate(key: WorkflowTemplateKey) {
    onChange({ templateKey: key, config: defaultConfigFor(key) });
  }

  function patchConfig(patch: Partial<WorkflowTemplateConfig>) {
    onChange({ ...value, config: { ...value.config, ...patch } });
  }

  return (
    <div className={`space-y-5 ${chrome}`}>
      <div>
        <h3 className="mb-1 flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-text-primary">
          Workflow
          <HelpTip>
            Open lets anyone RSVP. Members Only restricts to approved members. Apply or Pay
            gives non-members two routes — apply for free or pay to skip the line.
          </HelpTip>
        </h3>
        <p className="text-[13px] text-text-secondary">
          Pick how people get into this event. Custom workflows are coming soon.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {WORKFLOW_TEMPLATES.map((t) => {
          const active = t.key === value.templateKey;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTemplate(t.key)}
              className={`rounded-md border px-3 py-3 text-left transition-colors ${
                active
                  ? 'border-primary bg-primary-soft text-text-primary'
                  : 'border-border bg-card text-text-secondary hover:border-primary hover:text-text-primary'
              }`}
            >
              <span className="block text-sm font-semibold text-text-primary">{t.label}</span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-text-secondary">
                {t.description}
              </span>
            </button>
          );
        })}
        <span
          className="rounded-md border border-dashed border-border bg-transparent px-3 py-3 text-left text-text-tertiary"
          aria-disabled="true"
          title="Custom workflows coming soon"
        >
          <span className="block text-sm font-semibold">Custom</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug">Coming soon</span>
        </span>
      </div>

      <ConfigEditor templateKey={value.templateKey} config={value.config} onChange={patchConfig} />

      <div className="rounded-md border border-border bg-card p-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-text-secondary">
          In plain English
        </p>
        <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-text-primary">
          {summary.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ConfigEditor({
  templateKey,
  config,
  onChange,
}: {
  templateKey: WorkflowTemplateKey;
  config: WorkflowTemplateConfig;
  onChange: (patch: Partial<WorkflowTemplateConfig>) => void;
}) {
  switch (templateKey) {
    case 'open':
      return null;
    case 'members_only':
      return (
        <MembersOnlyTierField config={config} onChange={onChange} />
      );
    case 'ticketed_approval':
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Non-member price (USD)">
            <PriceInput
              value={config.amountCents ?? 0}
              onChange={(c) => onChange({ amountCents: c })}
            />
          </Field>
          <Field
            label="Approval required"
            tip="When on, every application waits for an operator to approve or reject before becoming an RSVP. Off means anyone who applies is auto-confirmed."
          >
            <Toggle
              checked={config.requiresApproval ?? true}
              onChange={(v) => onChange({ requiresApproval: v })}
              label={config.requiresApproval ?? true ? 'On — review each application' : 'Off — auto approve'}
            />
          </Field>
        </div>
      );
    case 'paid_only':
      return (
        <Field label="Ticket price (USD)">
          <PriceInput
            value={config.amountCents ?? 0}
            onChange={(c) => onChange({ amountCents: c })}
          />
        </Field>
      );
    case 'referral_required':
      return (
        <Field label="Minimum referrals">
          <input
            type="number"
            min={1}
            value={config.minReferrals ?? 1}
            onChange={(e) => onChange({ minReferrals: Math.max(1, parseInt(e.target.value || '1', 10)) })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
          />
        </Field>
      );
    case 'invitation_code':
      return (
        <Field label="Codes (comma separated)">
          <input
            type="text"
            value={(config.codes ?? []).join(', ')}
            onChange={(e) =>
              onChange({
                codes: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="velvet-rope, plus-one-only"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
          />
        </Field>
      );
  }
}

function Field({
  label,
  tip,
  children,
}: {
  label: string;
  tip?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-text-secondary">
        {label}
        {tip ? <HelpTip>{tip}</HelpTip> : null}
      </label>
      {children}
    </div>
  );
}

function PriceInput({ value, onChange }: { value: number; onChange: (cents: number) => void }) {
  const dollars = (value / 100).toString();
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary">$</span>
      <input
        type="number"
        min={0}
        step="0.01"
        value={dollars}
        onChange={(e) => {
          const n = parseFloat(e.target.value || '0');
          if (Number.isNaN(n)) return onChange(0);
          onChange(Math.max(0, Math.round(n * 100)));
        }}
        className="w-full rounded-md border border-border bg-background py-2 pl-7 pr-3 text-sm text-text-primary focus:border-primary focus:outline-none"
      />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary"
    >
      <span>{label}</span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-border'
        }`}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform"
          style={{ left: checked ? '1.125rem' : '0.125rem' }}
        />
      </span>
    </button>
  );
}

function defaultConfigFor(key: WorkflowTemplateKey): WorkflowTemplateConfig {
  switch (key) {
    case 'ticketed_approval':
      return { amountCents: 15000, requiresApproval: true };
    case 'paid_only':
      return { amountCents: 5000 };
    case 'referral_required':
      return { minReferrals: 1 };
    case 'invitation_code':
      return { codes: [] };
    case 'members_only':
      return { minTierId: null };
    case 'open':
    default:
      return {};
  }
}

function MembersOnlyTierField({
  config,
  onChange,
}: {
  config: WorkflowTemplateConfig;
  onChange: (patch: Partial<WorkflowTemplateConfig>) => void;
}) {
  const [tiers, setTiers] = useState<TierRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/operator/tiers', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { tiers: TierRow[] }) => {
        if (cancelled) return;
        setTiers(d.tiers);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Could not load tiers.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (tiers === null && !error) {
    return (
      <Field label="Minimum tier">
        <p className="text-sm text-text-muted">Loading tiers…</p>
      </Field>
    );
  }

  if (error) {
    return (
      <Field label="Minimum tier">
        <p className="text-sm text-danger">{error}</p>
      </Field>
    );
  }

  if (!tiers || tiers.length === 0) {
    return (
      <Field label="Minimum tier">
        <div className="rounded-md border border-dashed border-border bg-background/50 px-3 py-3 text-sm">
          <p className="text-text-secondary">
            No tiers configured. Anyone with member status can RSVP.
          </p>
          <Link
            href="/operator/settings/tiers"
            className="mt-1 inline-block text-text-primary underline-offset-2 hover:underline"
          >
            Add tiers in Settings → Member Tiers →
          </Link>
        </div>
      </Field>
    );
  }

  return (
    <Field label="Minimum tier">
      <select
        value={config.minTierId ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ minTierId: v === '' ? null : v });
        }}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
      >
        <option value="">Any member</option>
        {tiers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} or above
          </option>
        ))}
      </select>
    </Field>
  );
}
