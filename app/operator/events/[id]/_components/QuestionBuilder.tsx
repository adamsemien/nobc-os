'use client';

import { useState, useCallback } from 'react';
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
import * as Dialog from '@radix-ui/react-dialog';
import { GripVertical, Plus, Trash2, X } from 'lucide-react';

export type EventQuestion = {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'date';
  label: string;
  required: boolean;
  options?: string[];
};

const FIELD_TYPES: { value: EventQuestion['type']; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'select', label: 'Multiple choice' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
];

function SortableQuestion({
  q,
  onDelete,
}: {
  q: EventQuestion;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-3 rounded border border-border bg-surface-elevated px-4 py-3"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Drag to reorder"
        className="mt-0.5 touch-none text-text-muted hover:text-text-primary"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{q.label}</p>
        <p className="text-xs text-text-muted mt-0.5">
          {FIELD_TYPES.find(t => t.value === q.type)?.label}
          {q.required ? ' · Required' : ''}
          {q.options?.length ? ` · ${q.options.length} options` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDelete(q.id)}
        aria-label="Delete question"
        className="mt-0.5 text-text-muted hover:text-danger transition-colors"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function AddQuestionDialog({
  onAdd,
  children,
}: {
  onAdd: (q: EventQuestion) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<EventQuestion['type']>('text');
  const [label, setLabel] = useState('');
  const [required, setRequired] = useState(false);
  const [optionsText, setOptionsText] = useState('');

  function reset() {
    setType('text');
    setLabel('');
    setRequired(false);
    setOptionsText('');
  }

  function handleAdd() {
    if (!label.trim()) return;
    const options =
      type === 'select'
        ? optionsText.split('\n').map(s => s.trim()).filter(Boolean)
        : undefined;
    onAdd({
      id: `q_${Date.now()}`,
      type,
      label: label.trim(),
      required,
      options,
    });
    reset();
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface-elevated p-6 shadow-xl"
          onCloseAutoFocus={e => e.preventDefault()}
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold text-text-primary">
              Add question
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-text-muted hover:text-text-primary">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1" htmlFor="q-type">
                Field type
              </label>
              <select
                id="q-type"
                value={type}
                onChange={e => setType(e.target.value as EventQuestion['type'])}
                className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {FIELD_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1" htmlFor="q-label">
                Question label
              </label>
              <input
                id="q-label"
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. What are you working on?"
                className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {type === 'select' ? (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1" htmlFor="q-options">
                  Options (one per line)
                </label>
                <textarea
                  id="q-options"
                  rows={4}
                  value={optionsText}
                  onChange={e => setOptionsText(e.target.value)}
                  placeholder="Option A&#10;Option B&#10;Option C"
                  className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
            ) : null}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={required}
                onChange={e => setRequired(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm text-text-primary">Required</span>
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!label.trim()}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              Add question
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type Props = {
  eventId: string;
  initialQuestions: EventQuestion[];
};

export function QuestionBuilder({ eventId, initialQuestions }: Props) {
  const [questions, setQuestions] = useState<EventQuestion[]>(initialQuestions);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setQuestions(prev => {
        const oldIdx = prev.findIndex(q => q.id === active.id);
        const newIdx = prev.findIndex(q => q.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }

  const handleAdd = useCallback((q: EventQuestion) => {
    setQuestions(prev => [...prev, q]);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/operator/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ customQuestions: questions }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={questions.map(q => q.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {questions.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">
                No questions yet. Add one to collect info from RSVPs.
              </p>
            ) : (
              questions.map(q => (
                <SortableQuestion key={q.id} q={q} onDelete={handleDelete} />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-3 pt-2">
        <AddQuestionDialog onAdd={handleAdd}>
          <button
            type="button"
            className="flex items-center gap-2 rounded border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Add question
          </button>
        </AddQuestionDialog>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save questions'}
        </button>
      </div>
    </div>
  );
}
