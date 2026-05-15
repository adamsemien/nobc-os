'use client';

import { useState, useEffect } from 'react';
import type { EventAccess, MemberGate, GuestGate } from '@/lib/event-access-schema';
import { isGateSupported } from '@/lib/event-access-schema';
import { GateRadio, type GateOption } from './GateRadio';

const MEMBER_GATE_OPTIONS: Omit<GateOption, 'supported'>[] = [
  { value: 'auto_confirm', label: 'Reserve My Spot', description: 'One tap, instantly confirmed.' },
  { value: 'questions', label: 'Register with fields', description: 'Answer required fields, auto-confirmed.' },
  { value: 'questions_approval', label: 'Apply to Attend', description: 'Answer fields, you approve manually.' },
  { value: 'pay', label: 'Ticketed', description: 'Pay member price, auto-confirmed.' },
  { value: 'pay_questions', label: 'Ticketed, fields after', description: 'Pay, then answer fields.' },
  { value: 'questions_pay', label: 'Fields, then ticketed', description: 'Answer fields, then pay.' },
  { value: 'questions_pay_approval', label: 'Apply + ticketed', description: 'Fields, hold payment, you approve.' },
];

const GUEST_GATE_OPTIONS: Omit<GateOption, 'supported'>[] = [
  { value: 'pay', label: 'Ticketed', description: 'Pay and confirmed instantly.' },
  { value: 'apply', label: 'Apply to Attend', description: 'Answer fields, you approve. No payment.' },
  { value: 'pay_questions', label: 'Ticketed, fields after', description: 'Pay, then answer fields.' },
  { value: 'questions_pay', label: 'Fields, then ticketed', description: 'Answer fields, then pay.' },
  { value: 'questions_approval', label: 'Apply to Attend (alt)', description: 'Fields, you approve. No payment.' },
  { value: 'apply_pay', label: 'Apply + ticketed', description: 'Fields, you approve, then payment.' },
];

type Props = {
  value: EventAccess;
  onChange: (v: EventAccess) => void;
};

export function AccessGroupsCard({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <AccessGroup
        title="Member Access"
        subtitle="For approved NoBC members"
        enabled={value.member.enabled}
        onToggle={(b) => onChange({ ...value, member: { ...value.member, enabled: b } })}
      >
        <GateRadio
          name="member-gate"
          value={value.member.gate}
          onChange={(g) => onChange({ ...value, member: { ...value.member, gate: g as MemberGate } })}
          options={MEMBER_GATE_OPTIONS.map((o) => ({ ...o, supported: isGateSupported(o.value) }))}
        />
        {/pay/.test(value.member.gate) && (
          <PriceField
            label="Member price"
            valueCents={value.member.priceCents}
            onChange={(cents) => onChange({ ...value, member: { ...value.member, priceCents: cents } })}
          />
        )}
      </AccessGroup>

      <AccessGroup
        title="Guest Access"
        subtitle="For everyone else"
        enabled={value.guest.enabled}
        onToggle={(b) => onChange({ ...value, guest: { ...value.guest, enabled: b } })}
      >
        <GateRadio
          name="guest-gate"
          value={value.guest.gate}
          onChange={(g) => onChange({ ...value, guest: { ...value.guest, gate: g as GuestGate } })}
          options={GUEST_GATE_OPTIONS.map((o) => ({ ...o, supported: isGateSupported(o.value) }))}
        />
        {/pay/.test(value.guest.gate) && (
          <PriceField
            label="Guest price"
            valueCents={value.guest.priceCents}
            onChange={(cents) => onChange({ ...value, guest: { ...value.guest, priceCents: cents } })}
          />
        )}
      </AccessGroup>

      <AccessGroup
        title="Comp Access"
        subtitle="Complimentary tickets you issue manually"
        enabled={value.comp.enabled}
        onToggle={(b) => onChange({ ...value, comp: { ...value.comp, enabled: b } })}
      >
        <BudgetCapField
          value={value.comp.budgetCap}
          onChange={(n) => onChange({ ...value, comp: { ...value.comp, budgetCap: n } })}
        />
      </AccessGroup>

      <p className="text-xs text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)] mt-2">
        Registration fields and flow design live in event settings after saving.
      </p>
    </div>
  );
}

function AccessGroup({
  title,
  subtitle,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  enabled: boolean;
  onToggle: (b: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-[var(--apply-rule)] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-[22px] font-normal leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            {subtitle}
          </p>
        </div>
        <Toggle checked={enabled} onChange={onToggle} />
      </div>
      {enabled && <div className="mt-5 flex flex-col gap-4">{children}</div>}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-[var(--nobc-red)]' : 'bg-[var(--apply-rule)]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function PriceField({
  label,
  valueCents,
  onChange,
}: {
  label: string;
  valueCents: number;
  onChange: (cents: number) => void;
}) {
  const [text, setText] = useState((valueCents / 100).toString());

  useEffect(() => {
    setText((valueCents / 100).toString());
  }, [valueCents]);

  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const num = parseFloat(e.target.value);
            if (!Number.isNaN(num) && num >= 0) onChange(Math.round(num * 100));
            if (e.target.value === '') onChange(0);
          }}
          className="w-full rounded-sm border border-[var(--apply-rule)] bg-white pl-7 pr-3 py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
          placeholder="0"
        />
      </div>
    </div>
  );
}

function BudgetCapField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        Comp budget (optional max)
      </label>
      <input
        type="number"
        min={0}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : Math.max(0, parseInt(v, 10) || 0));
        }}
        className="w-full rounded-sm border border-[var(--apply-rule)] bg-white px-3 py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
        placeholder="No cap"
      />
    </div>
  );
}
