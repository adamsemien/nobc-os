'use client';

import { useState } from 'react';

export type CustomQuestion = {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'date';
  label: string;
  required: boolean;
  options?: string[];
};

export type CustomAnswers = Record<string, string | boolean>;

type Props = {
  questions: CustomQuestion[];
  onSubmit: (answers: CustomAnswers) => void;
  onBack: () => void;
  loading: boolean;
};

export function CustomQuestionsForm({ questions, onSubmit, onBack, loading }: Props) {
  const [answers, setAnswers] = useState<CustomAnswers>(() =>
    Object.fromEntries(questions.map(q => [q.id, q.type === 'checkbox' ? false : ''])),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(answers);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--ev-muted)] font-[family-name:var(--font-dm-sans)]">
        A few questions
      </p>
      {questions.map(q => (
        <div key={q.id}>
          <label
            htmlFor={`cq-${q.id}`}
            className="mb-1 block text-sm font-normal text-[var(--ev-ink)] font-[family-name:var(--font-dm-sans)]"
          >
            {q.label}
            {q.required ? (
              <span aria-hidden className="ml-1 text-[var(--ev-accent)]">
                *
              </span>
            ) : null}
          </label>
          {q.type === 'textarea' ? (
            <textarea
              id={`cq-${q.id}`}
              rows={3}
              required={q.required}
              value={String(answers[q.id] ?? '')}
              onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              className="w-full resize-none border-0 border-b border-[var(--ev-rule)] bg-transparent py-2 text-base text-[var(--ev-ink)] focus:border-[var(--ev-accent)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
            />
          ) : q.type === 'select' && q.options ? (
            <select
              id={`cq-${q.id}`}
              required={q.required}
              value={String(answers[q.id] ?? '')}
              onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              className="w-full border-0 border-b border-[var(--ev-rule)] bg-transparent py-2 text-base text-[var(--ev-ink)] focus:border-[var(--ev-accent)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
            >
              <option value="">Select…</option>
              {q.options.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : q.type === 'checkbox' ? (
            <label className="flex cursor-pointer items-center gap-3 font-[family-name:var(--font-dm-sans)]">
              <input
                id={`cq-${q.id}`}
                type="checkbox"
                required={q.required}
                checked={Boolean(answers[q.id])}
                onChange={e =>
                  setAnswers(prev => ({ ...prev, [q.id]: e.target.checked }))
                }
                className="h-4 w-4 accent-[var(--ev-accent)]"
              />
              <span className="text-sm text-[var(--ev-ink)]">{q.label}</span>
            </label>
          ) : (
            <input
              id={`cq-${q.id}`}
              type={q.type}
              required={q.required}
              value={String(answers[q.id] ?? '')}
              onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              className="w-full border-0 border-b border-[var(--ev-rule)] bg-transparent py-2 text-base text-[var(--ev-ink)] focus:border-[var(--ev-accent)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-[11px] uppercase tracking-widest text-[var(--ev-muted)] underline-offset-4 hover:underline font-[family-name:var(--font-dm-sans)]"
        >
          ← Back
        </button>
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="rounded-sm bg-[var(--ev-accent)] px-6 py-3 text-[11px] font-medium uppercase tracking-widest text-[var(--ev-on-accent)] transition-colors hover:bg-[var(--ev-accent-hover)] disabled:opacity-60 font-[family-name:var(--font-dm-sans)]"
        >
          {loading ? 'Loading…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}
