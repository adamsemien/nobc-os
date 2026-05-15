'use client';

import { useEffect, useState } from 'react';
import { X, Plus, Check } from 'lucide-react';
import type { MemberGate, GuestGate } from '@/lib/event-access-schema';
import {
  type FlowStep,
  FLOW_STEP_META,
  canonicalizeFlow,
  memberGateFromFlow,
  guestGateFromFlow,
  flowFromMemberGate,
  flowFromGuestGate,
  invalidFlowHint,
} from '@/lib/event-access-flow';

type Props = {
  group: 'member' | 'guest';
  gate: MemberGate | GuestGate;
  onGateChange: (gate: MemberGate | GuestGate) => void;
  priceCents: number;
  onPriceChange: (cents: number) => void;
  previewFields: string[];
};

const ALL_STEPS: FlowStep[] = ['fields', 'pay', 'approval'];

export function FlowBuilder({
  group,
  gate,
  onGateChange,
  priceCents,
  onPriceChange,
  previewFields,
}: Props) {
  const [steps, setSteps] = useState<FlowStep[]>(() =>
    group === 'member'
      ? flowFromMemberGate(gate as MemberGate)
      : flowFromGuestGate(gate as GuestGate),
  );

  // Resync when the gate changes from outside (e.g. a template is applied).
  useEffect(() => {
    setSteps(
      group === 'member'
        ? flowFromMemberGate(gate as MemberGate)
        : flowFromGuestGate(gate as GuestGate),
    );
  }, [gate, group]);

  function applySteps(next: FlowStep[]) {
    const canon = canonicalizeFlow(next);
    setSteps(canon);
    const resolution =
      group === 'member' ? memberGateFromFlow(canon) : guestGateFromFlow(canon);
    if (resolution) onGateChange(resolution.gate);
  }

  function addStep(s: FlowStep) {
    applySteps([...steps, s]);
  }

  function removeStep(s: FlowStep) {
    let next = steps.filter((x) => x !== s);
    // Await Approval depends on Answer Fields.
    if (s === 'fields') next = next.filter((x) => x !== 'approval');
    applySteps(next);
  }

  const active = canonicalizeFlow(steps);
  const inactive = ALL_STEPS.filter((s) => !active.includes(s));
  const resolution =
    group === 'member' ? memberGateFromFlow(active) : guestGateFromFlow(active);
  const invalid = resolution === null;
  const unsupported = resolution !== null && !resolution.supported;
  const hasPay = active.includes('pay');
  const hasFields = active.includes('fields');

  return (
    <div className="flex flex-col gap-4">
      {/* Flow strip */}
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          The flow
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StepPill label="Register" locked />
          {active.map((s) => (
            <ConnectedPill key={s}>
              <StepPill
                label={FLOW_STEP_META[s].label}
                onRemove={() => removeStep(s)}
              />
            </ConnectedPill>
          ))}
        </div>
      </div>

      {/* Add blocks */}
      {inactive.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            Add a step
          </p>
          <div className="flex flex-wrap gap-2">
            {inactive.map((s) => {
              const needsFields = s === 'approval' && !hasFields;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={needsFields}
                  onClick={() => addStep(s)}
                  title={
                    needsFields
                      ? 'Add an Answer Fields step first'
                      : FLOW_STEP_META[s].hint
                  }
                  className={`inline-flex items-center gap-1.5 rounded-sm border border-dashed px-3 py-2 text-sm font-[family-name:var(--font-dm-sans)] transition-colors ${
                    needsFields
                      ? 'cursor-not-allowed border-[var(--apply-rule)] text-[var(--apply-muted)] opacity-50'
                      : 'border-[var(--apply-rule)] text-[var(--apply-ink)] hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)]'
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {FLOW_STEP_META[s].label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Readable summary */}
      <p className="rounded-sm bg-[#F9F7F2] px-3 py-2 text-xs text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
        {['Register', ...active.map((s) => FLOW_STEP_META[s].label)].join('  →  ')}
      </p>

      {/* Warnings */}
      {invalid && (
        <p className="rounded-sm border border-[var(--nobc-red)] bg-[#FBEBE9] px-3 py-2 text-xs text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
          {invalidFlowHint(group, active)}
        </p>
      )}
      {unsupported && (
        <p className="rounded-sm bg-[#F1E8D6] px-3 py-2 text-xs text-[#8A6A2E] font-[family-name:var(--font-dm-sans)]">
          Coming soon — this flow isn&rsquo;t live yet. Members will see a notice and
          can&rsquo;t register until it ships.
        </p>
      )}

      {/* Field preview */}
      {hasFields && (
        <div className="rounded-sm border border-[var(--apply-rule)] bg-white px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            Fields in this flow
          </p>
          {previewFields.length > 0 ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {previewFields.map((f, i) => (
                <li
                  key={i}
                  className="rounded-sm bg-[#F9F7F2] px-2 py-0.5 text-xs text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]"
                >
                  {f}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              No fields yet — add one in Registration Fields below.
            </p>
          )}
        </div>
      )}

      {/* Contextual price */}
      {hasPay && (
        <PriceField
          label={group === 'member' ? 'Member price' : 'Guest price'}
          valueCents={priceCents}
          onChange={onPriceChange}
        />
      )}
    </div>
  );
}

function ConnectedPill({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[var(--apply-muted)]" aria-hidden>
        →
      </span>
      {children}
    </div>
  );
}

function StepPill({
  label,
  locked,
  onRemove,
}: {
  label: string;
  locked?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-2 text-sm font-medium font-[family-name:var(--font-dm-sans)] ${
        locked
          ? 'border-[var(--apply-rule)] bg-[#F9F7F2] text-[var(--apply-muted)]'
          : 'border-[var(--nobc-red)] bg-[#FBEBE9] text-[var(--apply-ink)]'
      }`}
    >
      {locked ? <Check className="h-3.5 w-3.5" /> : null}
      {label}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="text-[var(--apply-muted)] hover:text-[var(--nobc-red)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </span>
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
          className="w-full rounded-sm border border-[var(--apply-rule)] bg-white py-2 pl-7 pr-3 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
          placeholder="0"
        />
      </div>
    </div>
  );
}
