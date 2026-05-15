'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Plus, GripVertical, RotateCcw } from 'lucide-react';
import type { FlowStep } from '@/lib/event-access-schema';
import { defaultMemberFlow, defaultGuestFlow } from '@/lib/event-access-schema';
import { FLOW_STEP_META } from '@/lib/event-access-flow';
import type { AccessQuestion } from '@/lib/registration-fields';
import { RegistrationFieldsEditor } from './RegistrationFieldsEditor';

type Group = 'member' | 'guest';

type Props = {
  group: Group;
  flow: FlowStep[];
  onFlowChange: (flow: FlowStep[]) => void;
  priceCents: number;
  onPriceChange: (cents: number) => void;
  questions: AccessQuestion[];
  onQuestionsChange: (q: AccessQuestion[]) => void;
};

const ALL_STEPS: FlowStep[] = ['fields', 'pay', 'approval'];

function defaultFlow(group: Group): FlowStep[] {
  return group === 'member' ? defaultMemberFlow() : defaultGuestFlow();
}

type Template = { key: string; label: string; flow: FlowStep[] };

function templatesFor(group: Group): Template[] {
  const who = group === 'member' ? 'Members' : 'Guests';
  return [
    { key: 'apply', label: `${who} apply, you approve`, flow: ['fields', 'approval'] },
    { key: 'pay', label: `${who} pay`, flow: ['pay'] },
    { key: 'open', label: `${who} just show up`, flow: [] },
  ];
}

export function FlowBuilder({
  group,
  flow,
  onFlowChange,
  priceCents,
  onPriceChange,
  questions,
  onQuestionsChange,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuWrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  function addStep(s: FlowStep) {
    onFlowChange([...flow, s]);
    setMenuOpen(false);
  }

  function removeStep(idx: number) {
    onFlowChange(flow.filter((_, i) => i !== idx));
  }

  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= flow.length) return;
    const next = [...flow];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onFlowChange(next);
  }

  const inactive = ALL_STEPS.filter((s) => !flow.includes(s));
  const templates = templatesFor(group);
  const isDefault =
    JSON.stringify(flow) === JSON.stringify(defaultFlow(group));

  return (
    <div className="flex flex-col gap-5">
      {/* Templates */}
      <div>
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          Start from a template
        </p>
        <div className="flex flex-wrap gap-1.5">
          {templates.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onFlowChange(t.flow)}
              className="rounded-full border border-[var(--apply-rule)] px-2.5 py-1 text-[11px] text-[var(--apply-ink)] transition-colors hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Flow canvas */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            The flow
          </p>
          {!isDefault && (
            <button
              type="button"
              onClick={() => onFlowChange(defaultFlow(group))}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--apply-muted)] underline-offset-4 hover:text-[var(--nobc-red)] hover:underline font-[family-name:var(--font-dm-sans)]"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to default
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-[var(--apply-rule)] bg-raised p-3">
          <span className="inline-flex items-center rounded-sm border border-[var(--apply-rule)] bg-card px-3 py-2 text-sm font-medium text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            Register
          </span>

          {flow.map((s, i) => (
            <div key={`${s}-${i}`} className="flex items-center gap-1.5">
              <Arrow />
              <StepBlock
                step={s}
                isDragging={dragIdx === i}
                priceCents={priceCents}
                onPriceChange={onPriceChange}
                onRemove={() => removeStep(i)}
                onDragStart={() => setDragIdx(i)}
                onDragEnd={() => setDragIdx(null)}
                onDropOnto={() => {
                  if (dragIdx !== null) reorder(dragIdx, i);
                  setDragIdx(null);
                }}
              />
            </div>
          ))}

          {inactive.length > 0 && (
            <div className="flex items-center gap-1.5" ref={menuWrapRef}>
              <Arrow />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-dashed border-[var(--apply-rule)] bg-card px-3 py-2 text-sm text-[var(--apply-ink)] transition-colors hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Step
                </button>
                {menuOpen && (
                  <div className="absolute left-0 top-[calc(100%+6px)] z-20 w-60 rounded-sm border border-[var(--apply-rule)] bg-card p-1 shadow-lg">
                    {inactive.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => addStep(s)}
                        className="flex w-full flex-col items-start rounded-sm px-2.5 py-2 text-left transition-colors hover:bg-raised"
                      >
                        <span className="text-sm font-medium text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                          {FLOW_STEP_META[s].label}
                        </span>
                        <span className="text-[11px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                          {FLOW_STEP_META[s].hint}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

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

function StepBlock({
  step,
  isDragging,
  priceCents,
  onPriceChange,
  onRemove,
  onDragStart,
  onDragEnd,
  onDropOnto,
}: {
  step: FlowStep;
  isDragging: boolean;
  priceCents: number;
  onPriceChange: (cents: number) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOnto: () => void;
}) {
  return (
    <span
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDropOnto();
      }}
      className={`inline-flex items-center gap-1.5 rounded-sm border border-[var(--nobc-red)] bg-primary-soft px-2.5 py-2 text-sm font-medium text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)] ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <span
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="cursor-grab text-[var(--apply-muted)] active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>
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
    <span className="inline-flex items-center rounded-sm border border-[var(--apply-rule)] bg-card pl-1.5">
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
