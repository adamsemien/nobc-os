'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, X, ChevronUp, ChevronDown } from 'lucide-react';
import type { Gate, GateType } from '@/lib/event-gates';
import { GATE_META, GATE_TYPES, newGate } from '@/lib/event-gates';
import type { AccessQuestion } from '@/lib/registration-fields';
import { RegistrationFieldsEditor } from './RegistrationFieldsEditor';

type Group = 'member' | 'guest';

type Props = {
  group: Group;
  gates: Gate[];
  onGatesChange: (gates: Gate[]) => void;
  priceCents: number;
  onPriceChange: (cents: number) => void;
  questions: AccessQuestion[];
  onQuestionsChange: (q: AccessQuestion[]) => void;
};

const chrome = 'font-[family-name:var(--font-dm-sans)]';

export function FlowBuilder({
  group,
  gates,
  onGatesChange,
  priceCents,
  onPriceChange,
  questions,
  onQuestionsChange,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const from = gates.findIndex((g) => g.id === active.id);
      const to = gates.findIndex((g) => g.id === over.id);
      onGatesChange(arrayMove(gates, from, to));
    }
  }

  function addGate(type: GateType) {
    onGatesChange([...gates, newGate(type)]);
    setModalOpen(false);
  }

  function removeGate(id: string) {
    onGatesChange(gates.filter((g) => g.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function updateGate(id: string, patch: Partial<Gate>) {
    onGatesChange(gates.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    onGatesChange(arrayMove(gates, idx, idx - 1));
  }

  function moveDown(idx: number) {
    if (idx >= gates.length - 1) return;
    onGatesChange(arrayMove(gates, idx, idx + 1));
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Flow path */}
      {gates.length > 0 && (
        <div className={`flex flex-wrap items-center gap-1 text-[11px] text-[var(--apply-muted)] ${chrome}`}>
          <span className="rounded-sm bg-raised px-1.5 py-0.5 font-medium text-[var(--apply-ink)]">Register</span>
          {gates.map((g) => (
            <span key={g.id} className="flex items-center gap-1">
              <span aria-hidden className="opacity-40">→</span>
              <span className="rounded-sm bg-raised px-1.5 py-0.5 font-medium text-[var(--apply-ink)]">
                {GATE_META[g.type].emoji} {g.label}
              </span>
            </span>
          ))}
          <span aria-hidden className="opacity-40">→</span>
          <span>Done</span>
        </div>
      )}

      {/* Gate list */}
      {gates.length === 0 ? (
        <div className="flex items-center justify-center rounded-sm border border-dashed border-[var(--apply-rule)] py-8 text-center">
          <div>
            <p className={`text-sm font-medium text-[var(--apply-ink)] ${chrome}`}>No gates yet</p>
            <p className={`mt-1 text-xs text-[var(--apply-muted)] ${chrome}`}>
              Add a gate below — guests must pass each one in order.
            </p>
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={gates.map((g) => g.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {gates.map((gate, idx) => (
                <SortableGateCard
                  key={gate.id}
                  gate={gate}
                  index={idx}
                  total={gates.length}
                  isEditing={editingId === gate.id}
                  onToggleEdit={() => setEditingId(editingId === gate.id ? null : gate.id)}
                  onUpdate={(patch) => updateGate(gate.id, patch)}
                  onRemove={() => removeGate(gate.id)}
                  onMoveUp={() => moveUp(idx)}
                  onMoveDown={() => moveDown(idx)}
                  priceCents={priceCents}
                  onPriceChange={onPriceChange}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add gate */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`inline-flex w-fit items-center gap-2 rounded-sm border border-dashed border-[var(--apply-rule)] bg-card px-4 py-2.5 text-sm text-[var(--apply-ink)] transition-colors hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)] ${chrome}`}
      >
        <Plus className="h-4 w-4" />
        Add gate
      </button>

      {/* Registration fields */}
      <RegistrationFieldsEditor group={group} questions={questions} onChange={onQuestionsChange} />

      {/* Modal */}
      {modalOpen && <GatePickerModal onSelect={addGate} onClose={() => setModalOpen(false)} />}
    </div>
  );
}

// ─── Sortable gate card ──────────────────────────────────────────────────────

function SortableGateCard({
  gate, index, total, isEditing, onToggleEdit, onUpdate, onRemove, onMoveUp, onMoveDown, priceCents, onPriceChange,
}: {
  gate: Gate;
  index: number;
  total: number;
  isEditing: boolean;
  onToggleEdit: () => void;
  onUpdate: (patch: Partial<Gate>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  priceCents: number;
  onPriceChange: (cents: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: gate.id });
  const meta = GATE_META[gate.type];
  const chrome = 'font-[family-name:var(--font-dm-sans)]';

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="rounded-sm border border-[var(--apply-rule)] bg-card"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Step badge */}
        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--apply-rule)] text-[10px] font-semibold text-[var(--apply-muted)] ${chrome}`}>
          {index + 1}
        </div>

        {/* Emoji */}
        <span className="shrink-0 text-base leading-none" aria-hidden>{meta.emoji}</span>

        {/* Label + hint */}
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-medium text-[var(--apply-ink)] ${chrome}`}>{gate.label}</p>
          <p className={`text-[10px] text-[var(--apply-muted)] ${chrome}`}>
            {meta.description.split('.')[0]}
            {gate.capacity ? ` · ${gate.capacity} cap` : ''}
            {gate.approvalRequired ? ' · approval' : ''}
            {gate.deadline ? ' · deadline set' : ''}
          </p>
        </div>

        {/* Mobile up/down */}
        <div className="flex sm:hidden">
          <button type="button" onClick={onMoveUp} disabled={index === 0} aria-label="Move up"
            className="p-1 text-[var(--apply-muted)] hover:text-[var(--apply-ink)] disabled:opacity-25">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={index >= total - 1} aria-label="Move down"
            className="p-1 text-[var(--apply-muted)] hover:text-[var(--apply-ink)] disabled:opacity-25">
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {/* Desktop drag handle */}
        <button type="button" {...attributes} {...listeners} aria-label="Drag to reorder"
          className="hidden cursor-grab p-1 text-[var(--apply-muted)] hover:text-[var(--apply-ink)] active:cursor-grabbing sm:flex">
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Edit toggle */}
        <button type="button" onClick={onToggleEdit}
          className={`rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-widest transition-colors ${chrome} ${isEditing ? 'bg-raised text-[var(--nobc-red)]' : 'text-[var(--apply-muted)] hover:text-[var(--apply-ink)]'}`}>
          {isEditing ? 'done' : 'edit'}
        </button>

        {/* Delete */}
        <button type="button" onClick={onRemove} aria-label={`Remove ${gate.label}`}
          className="p-1 text-[var(--apply-muted)] hover:text-[var(--nobc-red)]">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded editor */}
      {isEditing && (
        <div className="border-t border-[var(--apply-rule)] px-3 py-3">
          <GateEditor gate={gate} onUpdate={onUpdate} priceCents={priceCents} onPriceChange={onPriceChange} />
        </div>
      )}
    </div>
  );
}

// ─── Gate inline editor ──────────────────────────────────────────────────────

function GateEditor({
  gate, onUpdate, priceCents, onPriceChange,
}: {
  gate: Gate;
  onUpdate: (patch: Partial<Gate>) => void;
  priceCents: number;
  onPriceChange: (cents: number) => void;
}) {
  const chrome = 'font-[family-name:var(--font-dm-sans)]';
  const inputCls = `w-full rounded-sm border border-[var(--apply-rule)] bg-surface px-3 py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none ${chrome}`;
  const labelCls = `mb-1 block text-[10px] font-medium uppercase tracking-widest text-[var(--apply-muted)] ${chrome}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Label */}
      <div>
        <label className={labelCls}>Label</label>
        <input type="text" value={gate.label} onChange={(e) => onUpdate({ label: e.target.value })} className={inputCls} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Capacity */}
        <div>
          <label className={labelCls}>Capacity (optional)</label>
          <input type="number" min={1} placeholder="No limit"
            value={gate.capacity ?? ''}
            onChange={(e) => onUpdate({ capacity: e.target.value ? parseInt(e.target.value, 10) : null })}
            className={inputCls}
          />
        </div>

        {/* Deadline */}
        <div>
          <label className={labelCls}>Deadline (optional)</label>
          <input type="datetime-local"
            value={gate.deadline ?? ''}
            onChange={(e) => onUpdate({ deadline: e.target.value || null })}
            className={inputCls}
          />
        </div>
      </div>

      {/* Approval toggle */}
      {(gate.type === 'application' || gate.type === 'waitlist' || gate.type === 'referral') && (
        <label className={`flex cursor-pointer items-center gap-2 text-sm text-[var(--apply-ink)] ${chrome}`}>
          <input type="checkbox" checked={gate.approvalRequired ?? false}
            onChange={(e) => onUpdate({ approvalRequired: e.target.checked })}
            className="h-4 w-4 accent-[var(--nobc-red)]" />
          Require manual approval before guest advances
        </label>
      )}

      {/* Ticket price */}
      {gate.type === 'ticket' && (
        <div>
          <label className={labelCls}>Ticket price</label>
          <div className={`flex items-center gap-1 rounded-sm border border-[var(--apply-rule)] bg-surface px-3 py-2`}>
            <span className={`text-sm text-[var(--apply-muted)] ${chrome}`}>$</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={priceCents ? (priceCents / 100).toString() : ''}
              onChange={(e) => {
                const num = parseFloat(e.target.value);
                onPriceChange(Number.isNaN(num) ? 0 : Math.round(num * 100));
              }}
              className={`min-w-0 flex-1 bg-transparent text-sm text-[var(--apply-ink)] focus:outline-none ${chrome}`}
            />
          </div>
        </div>
      )}

      {/* Custom question */}
      {gate.type === 'custom_question' && (
        <>
          <div>
            <label className={labelCls}>Question text</label>
            <input type="text" placeholder="e.g. Are you 21 or older?"
              value={gate.question ?? ''}
              onChange={(e) => onUpdate({ question: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Response type</label>
            <select value={gate.questionType ?? 'yes_no'}
              onChange={(e) => onUpdate({ questionType: e.target.value as Gate['questionType'] })}
              className={inputCls}
            >
              <option value="yes_no">Yes / No</option>
              <option value="short_text">Short text</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Gate picker modal ───────────────────────────────────────────────────────

function GatePickerModal({ onSelect, onClose }: { onSelect: (type: GateType) => void; onClose: () => void }) {
  const chrome = 'font-[family-name:var(--font-dm-sans)]';
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-[10px] border border-[var(--apply-rule)] bg-card shadow-[0_8px_32px_rgba(0,0,0,0.14)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--apply-rule)] px-4 py-3">
          <p className={`text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] ${chrome}`}>
            Choose gate type
          </p>
          <button type="button" onClick={onClose} className="text-[var(--apply-muted)] hover:text-[var(--apply-ink)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col p-2">
          {GATE_TYPES.map((type) => {
            const meta = GATE_META[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => onSelect(type)}
                className="flex items-start gap-3 rounded-sm px-3 py-2.5 text-left transition-colors hover:bg-raised"
              >
                <span className="mt-0.5 text-xl leading-none" aria-hidden>{meta.emoji}</span>
                <div>
                  <p className={`text-sm font-medium text-[var(--apply-ink)] ${chrome}`}>{meta.label}</p>
                  <p className={`mt-0.5 text-[11px] text-[var(--apply-muted)] ${chrome}`}>{meta.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
