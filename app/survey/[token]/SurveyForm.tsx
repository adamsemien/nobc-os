'use client';
/** Brand-lift survey form. Renders scale/yes-no/NPS/text inputs and POSTs to /api/survey/[token]. */
import { useState } from 'react';

type QType = 'scale5' | 'yesno' | 'nps' | 'text';
interface Q {
  key: string;
  prompt: string;
  type: QType;
  required: boolean;
}

const SCALE5_LABELS = ['Not at all', 'A little', 'Somewhat', 'Quite', 'Very'];

export function SurveyForm({ token, intro, questions }: { token: string; intro: string; questions: Q[] }) {
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, value: string | number) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  const missingRequired = questions.some((q) => q.required && answers[q.key] == null);

  async function onSubmit() {
    if (busy || missingRequired) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/survey/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (res.ok) setDone(true);
      else if (res.status === 409) setDone(true);
      else setError('Something went wrong — please try again.');
    } catch {
      setError('Something went wrong — please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="mx-auto mt-12 max-w-md text-center text-[18px] italic leading-[1.6] text-[var(--apply-muted)] font-[family-name:var(--font-cormorant)]">
        Thank you — your response is in. It stays anonymous in anything we share.
      </p>
    );
  }

  const pill = (active: boolean) =>
    `min-w-[40px] rounded-[4px] border px-3 py-2 text-[13px] transition-colors font-[family-name:var(--font-dm-sans)] ${active ? '' : ''}`;
  const pillStyle = (active: boolean) => ({
    borderColor: active ? 'var(--nobc-red)' : 'var(--apply-rule)',
    background: active ? 'var(--nobc-red)' : 'transparent',
    color: active ? 'var(--nobc-on-red)' : 'var(--apply-ink)',
  });

  return (
    <div className="mt-6">
      <p className="text-center text-[13px] uppercase tracking-[0.24em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        {intro}
      </p>

      <div className="mt-10 flex flex-col gap-9">
        {questions.map((q) => (
          <div key={q.key}>
            <label className="block text-[15px] leading-[1.5] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
              {q.prompt}
            </label>

            {q.type === 'scale5' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {SCALE5_LABELS.map((lbl, i) => {
                  const val = i + 1;
                  const active = answers[q.key] === val;
                  return (
                    <button key={val} type="button" onClick={() => set(q.key, val)} className={pill(active)} style={pillStyle(active)}>
                      {lbl}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === 'yesno' && (
              <div className="mt-3 flex gap-2">
                {['yes', 'no'].map((v) => {
                  const active = answers[q.key] === v;
                  return (
                    <button key={v} type="button" onClick={() => set(q.key, v)} className={`${pill(active)} capitalize`} style={pillStyle(active)}>
                      {v}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === 'nps' && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Array.from({ length: 11 }, (_, n) => {
                  const active = answers[q.key] === n;
                  return (
                    <button key={n} type="button" onClick={() => set(q.key, n)} className={pill(active)} style={pillStyle(active)}>
                      {n}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === 'text' && (
              <textarea
                value={(answers[q.key] as string) ?? ''}
                onChange={(e) => set(q.key, e.target.value)}
                className="mt-3 w-full rounded-[4px] border bg-transparent px-3 py-2 text-[14px] text-[var(--apply-ink)] outline-none focus:border-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
                style={{ borderColor: 'var(--apply-rule)', minHeight: 72 }}
                placeholder="Optional"
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="mt-6 text-[13px] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">{error}</p>}

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || missingRequired}
        className="mt-10 w-full rounded-[4px] bg-[var(--nobc-red)] px-4 py-3 text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--nobc-on-red)] transition-opacity disabled:opacity-50 font-[family-name:var(--font-dm-sans)]"
      >
        {busy ? 'Sending…' : 'Submit'}
      </button>
    </div>
  );
}
