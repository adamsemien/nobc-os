"use client";

import { Question, QuestionType } from "@/lib/types";
import { QUESTION_BANK, QUESTION_TYPES, blankQuestion, questionFromBank } from "@/lib/defaults";
import { Button, Toggle } from "./ui";

const HAS_OPTIONS: QuestionType[] = ["dropdown", "single_select", "multi_select"];

export function RegistrationFields({
  questions,
  onChange,
}: {
  questions: Question[];
  onChange: (q: Question[]) => void;
}) {
  function update(id: string, patch: Partial<Question>) {
    onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }
  function move(index: number, dir: -1 | 1) {
    const next = [...questions];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  function remove(id: string) {
    onChange(questions.filter((q) => q.id !== id));
  }
  function changeType(id: string, type: QuestionType) {
    const q = questions.find((x) => x.id === id);
    const options =
      HAS_OPTIONS.includes(type) && (!q || q.options.length === 0)
        ? ["Option 1", "Option 2"]
        : q?.options ?? [];
    update(id, { type, options });
  }

  const usedLabels = new Set(questions.map((q) => q.label.trim().toLowerCase()));
  const available = QUESTION_BANK.filter((q) => !usedLabels.has(q.label.toLowerCase()));

  return (
    <div className="space-y-4">
      {/* question bank */}
      {available.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
            Question bank — tap to add
          </p>
          <div className="flex flex-wrap gap-2">
            {available.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => onChange([...questions, questionFromBank(q)])}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-ink hover:border-gold/60 hover:text-gold"
              >
                + {q.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* active questions */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
          Your questions ({questions.length})
        </p>
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={q.id} className="rounded-2xl border border-border bg-panel-2 p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{i + 1}</span>
                <input
                  value={q.label}
                  onChange={(e) => update(q.id, { label: e.target.value })}
                  placeholder="Write your question…"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-gold/60"
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={q.type}
                  onChange={(e) => changeType(q.id, e.target.value as QuestionType)}
                  className="rounded-lg border border-border bg-panel px-2.5 py-2 text-xs text-muted outline-none focus:border-gold/60"
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <Toggle
                    checked={q.required}
                    onChange={(v) => update(q.id, { required: v })}
                    label="Required"
                  />
                  <span className="text-xs text-muted">Required</span>
                </div>
              </div>

              {HAS_OPTIONS.includes(q.type) && (
                <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <span className="text-xs text-muted">•</span>
                      <input
                        value={opt}
                        onChange={(e) => {
                          const options = [...q.options];
                          options[oi] = e.target.value;
                          update(q.id, { options });
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-border bg-panel px-2.5 py-1.5 text-xs text-ink outline-none focus:border-gold/60"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          update(q.id, { options: q.options.filter((_, x) => x !== oi) })
                        }
                        className="px-1.5 text-muted hover:text-red-400"
                        aria-label="Remove option"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => update(q.id, { options: [...q.options, `Option ${q.options.length + 1}`] })}
                    className="text-xs text-gold hover:text-gold/80"
                  >
                    + Add option
                  </button>
                </div>
              )}

              <div className="mt-2 flex items-center justify-end gap-1 border-t border-border pt-2">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-ink disabled:opacity-25"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === questions.length - 1}
                  aria-label="Move down"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-ink disabled:opacity-25"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(q.id)}
                  aria-label="Remove question"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          {questions.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
              No questions yet. Add from the bank above or write your own.
            </p>
          )}
        </div>
      </div>

      <Button
        variant="outline"
        onClick={() => onChange([...questions, blankQuestion()])}
        className="w-full border-dashed"
      >
        + Write a custom question
      </Button>
    </div>
  );
}
