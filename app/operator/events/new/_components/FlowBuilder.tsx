'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Plus, GripVertical } from 'lucide-react';
import type { MemberGate, GuestGate } from '@/lib/event-access-schema';
import {
  type FlowStep,
  FLOW_STEP_META,
  memberGateFromFlow,
  guestGateFromFlow,
  flowFromMemberGate,
  flowFromGuestGate,
  invalidFlowHint,
} from '@/lib/event-access-flow';
import {
  type AccessQuestion,
  appliesToMember,
  appliesToGuest,
} from '@/lib/registration-fields';
import { RegistrationFieldsEditor } from './RegistrationFieldsEditor';

type Group = 'member' | 'guest';

type Props = {
  group: Group;
  gate: MemberGate | GuestGate;
  onGateChange: (gate: MemberGate | GuestGate) => void;
  priceCents: number;
  onPriceChange: (cents: number) => void;
  questions: AccessQuestion[];
  onQuestionsChange: (q: AccessQuestion[]) => void;
};

function flowForGroup(group: Group, gate: MemberGate | GuestGate): FlowStep[] {
  return group === 'member'
    ? flowFromMemberGate(gate as MemberGate)
    : flowFromGuestGate(gate as GuestGate);
}

export function FlowBuilder({
  group,
  gate,
  onGateChange,
  priceCents,
  onPriceChange,
  questions,
  onQuestionsChange,
}: Props) {
  const [steps, setSteps] = useState<FlowStep[]>(() => flowForGroup(group, gate));
  const lastEmitted = useRef(gate);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  // Resync only when the gate changes from outside (e.g. a template is applied).
  useEffect(() => {
    if (gate === lastEmitted.current) return;
    lastEmitted.current = gate;
    setSteps(flowForGroup(group, gate));
  }, [gate, group]);

  // Close the add-step menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuWrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  function commit(next: FlowStep[]) {
    // Await Approval is always the final block.
    const hasApproval = next.includes('approval');
    const ordered: FlowStep[] = [
      ...next.filter((s) => s !== 'approval'),
      ...(hasApproval ? (['approval'] as FlowStep[]) : []),
    ];
    setSteps(ordered);
    const res =
      group === 'member'
        ? memberGateFromFlow(ordered)
        : guestGateFromFlow(ordered);
    if (res) {
      lastEmitted.current = res.gate;
      onGateChange(res.gate);
    }
  }

  function addStep(s: FlowStep) {
    commit([...steps, s]);
    setMenuOpen(false);
  }

  function removeStep(s: FlowStep) {
    let next = steps.filter((x) => x !== s);
    // Await Approval depends on the Answer Fields step.
    if (s === 'fields') next = next.filter((x) => x !== 'approval');
    commit(next);
  }

  function reorder(from: number, to: number) {
    const opt = steps.filter((s) => s !== 'approval');
    if (from === to || from < 0 || to < 0 || from >= opt.length) return;
    const [moved] = opt.splice(from, 1);
    opt.splice(to, 0, moved);
    commit([...opt, ...(steps.includes('approval') ? (['approval'] as FlowStep[]) : [])]);
  }

  const hasFields = steps.includes('fields');
  const hasPay = steps.includes('pay');
  const hasApproval = steps.includes('approval');
  const groupFields = questions.filter(
    group === 'member' ? appliesToMember : appliesToGuest,
  );
  const resolution =
    group === 'member' ? memberGateFromFlow(steps) : guestGateFromFlow(steps);
  const invalid = resolution === null;
  const unsupported = resolution !== null && !resolution.supported;

  const reorderable = steps.filter((s) => s !== 'approval');

  return (
    <div className="flex flex-col gap-5">
      {/* Flow canvas */}
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          The flow
        </p>
        <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-[var(--apply-rule)] bg-[#F9F7F2] p-3">
          {/* Register — fixed anchor */}
          <span className="inline-flex items-center rounded-sm border border-[var(--apply-rule)] bg-white px-3 py-2 text-sm font-medium text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            Register
          </span>

          {reorderable.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              <Arrow />
              <StepBlock
                step={s}
                index={i}
                draggable
                isDragging={dragIdx === i}
                priceCents={priceCents}
                onPriceChange={onPriceChange}
                onRemove={() => removeStep(s)}
                onDragStart={() => setDragIdx(i)}
                onDragEnd={() => setDragIdx(null)}
                onDropOnto={() => {
                  if (dragIdx !== null) reorder(dragIdx, i);
                  setDragIdx(null);
                }}
              />
            </div>
          ))}

          {hasApproval && (
            <div className="flex items-center gap-1.5">
              <Arrow />
              <StepBlock
                step="approval"
                index={-1}
                priceCents={priceCents}
                onPriceChange={onPriceChange}
                onRemove={() => removeStep('approval')}
              />
            </div>
          )}

          {steps.length < 3 && (
            <div className="flex items-center gap-1.5" ref={menuWrapRef}>
              <Arrow />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-dashed border-[var(--apply-rule)] bg-white px-3 py-2 text-sm text-[var(--apply-ink)] transition-colors hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Step
                </button>
                {menuOpen && (
                  <AddStepMenu
                    canAddFields={!hasFields}
                    fieldsEnabled={groupFields.length > 0}
                    canAddPay={!hasPay}
                    canAddApproval={!hasApproval}
                    approvalEnabled={hasFields}
                    onAdd={addStep}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Warnings */}
      {invalid && (
        <p className="rounded-sm border border-[var(--nobc-red)] bg-[#FBEBE9] px-3 py-2 text-xs text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
          {invalidFlowHint(group, steps)}
        </p>
      )}
      {unsupported && (
        <p className="rounded-sm bg-[#F1E8D6] px-3 py-2 text-xs text-[#8A6A2E] font-[family-name:var(--font-dm-sans)]">
          Coming soon — this flow isn&rsquo;t live yet. Members will see a notice and
          can&rsquo;t register until it ships.
        </p>
      )}

      {/* Per-group registration fields */}
      <RegistrationFieldsEditor
        group={group}
        questions={questions}
        onChange={onQuestionsChange}
      />
    </div>
  );
}

function Arrow() {
  return (
    <span className="text-[var(--apply-muted)]" aria-hidden>
      →
    </span>
  );
}

function AddStepMenu({
  canAddFields,
  fieldsEnabled,
  canAddPay,
  canAddApproval,
  approvalEnabled,
  onAdd,
}: {
  canAddFields: boolean;
  fieldsEnabled: boolean;
  canAddPay: boolean;
  canAddApproval: boolean;
  approvalEnabled: boolean;
  onAdd: (s: FlowStep) => void;
}) {
  return (
    <div className="absolute left-0 top-[calc(100%+6px)] z-20 w-60 rounded-sm border border-[var(--apply-rule)] bg-white p-1 shadow-lg">
      {canAddFields && (
        <MenuItem
          label={FLOW_STEP_META.fields.label}
          hint={
            fieldsEnabled
              ? FLOW_STEP_META.fields.hint
              : 'Add a registration field below first'
          }
          disabled={!fieldsEnabled}
          onClick={() => onAdd('fields')}
        />
      )}
      {canAddPay && (
        <MenuItem
          label={FLOW_STEP_META.pay.label}
          hint={FLOW_STEP_META.pay.hint}
          onClick={() => onAdd('pay')}
        />
      )}
      {canAddApproval && (
        <MenuItem
          label={FLOW_STEP_META.approval.label}
          hint={
            approvalEnabled
              ? FLOW_STEP_META.approval.hint
              : 'Add an Answer Fields step first'
          }
          disabled={!approvalEnabled}
          onClick={() => onAdd('approval')}
        />
      )}
    </div>
  );
}

function MenuItem({
  label,
  hint,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full flex-col items-start rounded-sm px-2.5 py-2 text-left transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:bg-[#F9F7F2]'
      }`}
    >
      <span className="text-sm font-medium text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
        {label}
      </span>
      <span className="text-[11px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        {hint}
      </span>
    </button>
  );
}

function StepBlock({
  step,
  index,
  draggable,
  isDragging,
  priceCents,
  onPriceChange,
  onRemove,
  onDragStart,
  onDragEnd,
  onDropOnto,
}: {
  step: FlowStep;
  index: number;
  draggable?: boolean;
  isDragging?: boolean;
  priceCents: number;
  onPriceChange: (cents: number) => void;
  onRemove: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDropOnto?: () => void;
}) {
  return (
    <span
      onDragOver={draggable ? (e) => e.preventDefault() : undefined}
      onDrop={
        draggable
          ? (e) => {
              e.preventDefault();
              onDropOnto?.();
            }
          : undefined
      }
      data-index={index}
      className={`inline-flex items-center gap-1.5 rounded-sm border border-[var(--nobc-red)] bg-[#FBEBE9] px-2.5 py-2 text-sm font-medium text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)] ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      {draggable && (
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="cursor-grab text-[var(--apply-muted)] active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      )}
      {FLOW_STEP_META[step].label}
      {step === 'pay' && (
        <PriceInput valueCents={priceCents} onChange={onPriceChange} />
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${FLOW_STEP_META[step].label}`}
        className="text-[var(--apply-muted)] hover:text-[var(--nobc-red)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function PriceInput({
  valueCents,
  onChange,
}: {
  valueCents: number;
  onChange: (cents: number) => void;
}) {
  const [text, setText] = useState(valueCents ? (valueCents / 100).toString() : '');

  useEffect(() => {
    setText(valueCents ? (valueCents / 100).toString() : '');
  }, [valueCents]);

  return (
    <span className="inline-flex items-center rounded-sm border border-[var(--apply-rule)] bg-white pl-1.5">
      <span className="text-xs text-[var(--apply-muted)]">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder="0"
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value === '') {
            onChange(0);
            return;
          }
          const num = parseFloat(e.target.value);
          if (!Number.isNaN(num) && num >= 0) onChange(Math.round(num * 100));
        }}
        className="w-12 bg-transparent px-1 py-0.5 text-xs text-[var(--apply-ink)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
      />
    </span>
  );
}
