'use client';

import { Check } from 'lucide-react';

export type AccessModeKey = 'RSVP' | 'APPLICATION' | 'TICKETED' | 'HYBRID' | 'INVITE_ONLY';

export type AccessModeConfig = {
  mode: AccessModeKey;
  approvalRequired?: boolean;
  capacity?: string;
  waitlistEnabled?: boolean;
  memberPriceCents?: string;
  nonMemberPriceCents?: string;
  refundWindowHours?: string;
  plusOnePriceCents?: string;
};

type Props = {
  value: AccessModeConfig;
  onChange: (v: AccessModeConfig) => void;
};

const MODE_CARDS: Array<{ key: AccessModeKey; title: string; blurb: string }> = [
  { key: 'RSVP', title: 'RSVP', blurb: 'Anyone can grab a spot. No payment required.' },
  {
    key: 'APPLICATION',
    title: 'Application Only',
    blurb: 'People apply, you approve each one.',
  },
  { key: 'TICKETED', title: 'Paid Ticket', blurb: "Buy a ticket, you're confirmed." },
  {
    key: 'HYBRID',
    title: 'Members Apply / Others Pay',
    blurb: 'Members request free entry. Non-members can pay to skip.',
  },
  {
    key: 'INVITE_ONLY',
    title: 'Invite Only',
    blurb: 'No public link. You control the guest list.',
  },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
      {children}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-sm border border-[var(--apply-rule)] bg-card px-3 py-2 text-sm text-[var(--apply-ink)] placeholder:text-[var(--apply-muted)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--nobc-red)]"
      />
      {label}
    </label>
  );
}

export function AccessModeSelector({ value, onChange }: Props) {
  function patch(p: Partial<AccessModeConfig>) {
    onChange({ ...value, ...p });
  }

  function selectMode(mode: AccessModeKey) {
    onChange({ ...value, mode });
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2">
        {MODE_CARDS.map(card => {
          const selected = value.mode === card.key;
          return (
            <button
              type="button"
              key={card.key}
              onClick={() => selectMode(card.key)}
              aria-pressed={selected}
              className={`relative rounded-sm border px-5 py-4 text-left transition-colors ${
                selected
                  ? 'border-[var(--nobc-red)] bg-raised'
                  : 'border-[var(--apply-rule)] bg-card hover:border-[var(--nobc-red)]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[20px] leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
                  {card.title}
                </h3>
                {selected ? (
                  <span className="mt-1 inline-flex h-2 w-2 shrink-0 rounded-full bg-[var(--nobc-red)]" aria-hidden />
                ) : null}
              </div>
              <p className="mt-1 text-[13px] leading-snug text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                {card.blurb}
              </p>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-sm border border-[var(--apply-rule)] bg-card transition-[max-height] duration-300">
        <div className="space-y-4 px-5 py-5">
          {value.mode === 'RSVP' && (
            <>
              <Toggle
                checked={value.approvalRequired ?? false}
                onChange={v => patch({ approvalRequired: v })}
                label="Approval required"
              />
              <div>
                <FieldLabel>Capacity (optional)</FieldLabel>
                <TextInput
                  type="number"
                  min={1}
                  value={value.capacity ?? ''}
                  onChange={e => patch({ capacity: e.target.value })}
                />
              </div>
              <Toggle
                checked={value.waitlistEnabled ?? false}
                onChange={v => patch({ waitlistEnabled: v })}
                label="Enable waitlist when full"
              />
            </>
          )}

          {value.mode === 'APPLICATION' && (
            <>
              <p className="flex items-center gap-2 text-xs text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                <Check className="h-3.5 w-3.5 text-[var(--nobc-red)]" strokeWidth={1.5} />
                Approval always required
              </p>
              <div>
                <FieldLabel>Capacity (optional)</FieldLabel>
                <TextInput
                  type="number"
                  min={1}
                  value={value.capacity ?? ''}
                  onChange={e => patch({ capacity: e.target.value })}
                />
              </div>
            </>
          )}

          {value.mode === 'TICKETED' && (
            <>
              <div>
                <FieldLabel>Ticket price ($)</FieldLabel>
                <TextInput
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={value.memberPriceCents ?? ''}
                  onChange={e => patch({ memberPriceCents: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel>Capacity (optional)</FieldLabel>
                <TextInput
                  type="number"
                  min={1}
                  value={value.capacity ?? ''}
                  onChange={e => patch({ capacity: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel>Refund window (hours)</FieldLabel>
                <TextInput
                  type="number"
                  min={0}
                  value={value.refundWindowHours ?? ''}
                  onChange={e => patch({ refundWindowHours: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel>Plus-one ticket price ($) (optional)</FieldLabel>
                <TextInput
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={value.plusOnePriceCents ?? ''}
                  onChange={e => patch({ plusOnePriceCents: e.target.value })}
                />
              </div>
            </>
          )}

          {value.mode === 'HYBRID' && (
            <>
              <Toggle
                checked={value.approvalRequired ?? false}
                onChange={v => patch({ approvalRequired: v })}
                label="Member approval required"
              />
              <div>
                <FieldLabel>Non-member ticket price ($)</FieldLabel>
                <TextInput
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={value.nonMemberPriceCents ?? ''}
                  onChange={e => patch({ nonMemberPriceCents: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel>Capacity (optional)</FieldLabel>
                <TextInput
                  type="number"
                  min={1}
                  value={value.capacity ?? ''}
                  onChange={e => patch({ capacity: e.target.value })}
                />
              </div>
              <Toggle
                checked={value.waitlistEnabled ?? false}
                onChange={v => patch({ waitlistEnabled: v })}
                label="Enable waitlist when full"
              />
            </>
          )}

          {value.mode === 'INVITE_ONLY' && (
            <>
              <div>
                <FieldLabel>Capacity (optional)</FieldLabel>
                <TextInput
                  type="number"
                  min={1}
                  value={value.capacity ?? ''}
                  onChange={e => patch({ capacity: e.target.value })}
                />
              </div>
              <p className="text-xs text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                Add guests manually from the Attendees tab after saving.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function modeConfigToApiFields(cfg: AccessModeConfig): Record<string, unknown> {
  switch (cfg.mode) {
    case 'RSVP':
      return {
        accessMode: 'OPEN',
        approvalRequired: cfg.approvalRequired ?? false,
        capacity: cfg.capacity ? parseInt(cfg.capacity, 10) : null,
      };
    case 'APPLICATION':
      return {
        accessMode: 'TICKETED',
        approvalRequired: true,
        capacity: cfg.capacity ? parseInt(cfg.capacity, 10) : null,
      };
    case 'TICKETED':
      return {
        accessMode: 'TICKETED',
        priceInCents: cfg.memberPriceCents
          ? Math.round(parseFloat(cfg.memberPriceCents) * 100)
          : 0,
        capacity: cfg.capacity ? parseInt(cfg.capacity, 10) : null,
        refundWindowHours: cfg.refundWindowHours
          ? parseInt(cfg.refundWindowHours, 10)
          : null,
      };
    case 'HYBRID':
      return {
        accessMode: 'TICKETED',
        approvalRequired: true,
        priceInCents: cfg.memberPriceCents
          ? Math.round(parseFloat(cfg.memberPriceCents) * 100)
          : 0,
        nonMemberPriceInCents: cfg.nonMemberPriceCents
          ? Math.round(parseFloat(cfg.nonMemberPriceCents) * 100)
          : 0,
        capacity: cfg.capacity ? parseInt(cfg.capacity, 10) : null,
      };
    case 'INVITE_ONLY':
      return {
        accessMode: 'OPEN',
        approvalRequired: true,
        capacity: cfg.capacity ? parseInt(cfg.capacity, 10) : null,
      };
  }
}
