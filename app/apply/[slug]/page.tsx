'use client';

import { use, useState } from 'react';
import { Playfair_Display } from 'next/font/google';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as Label from '@radix-ui/react-label';
import { Check } from 'lucide-react';
import {
  APPLY_QUESTIONS,
  type ApplicationQuestion,
  type ApplyFormValues,
} from '@/lib/apply-questions';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair-display',
});

type Status = 'idle' | 'loading' | 'success' | 'already_applied' | 'error';

function buildInitialState(): Record<string, string | boolean> {
  return Object.fromEntries(
    APPLY_QUESTIONS.map(q => [q.key, q.type === 'checkbox' ? false : ''])
  );
}

function groupQuestions(
  questions: ApplicationQuestion[]
): ApplicationQuestion[][] {
  const groups: ApplicationQuestion[][] = [];
  let i = 0;
  while (i < questions.length) {
    if (
      questions[i].layout === 'half' &&
      questions[i + 1]?.layout === 'half'
    ) {
      groups.push([questions[i], questions[i + 1]]);
      i += 2;
    } else {
      groups.push([questions[i]]);
      i++;
    }
  }
  return groups;
}

function InputField({
  q,
  value,
  onChange,
}: {
  q: ApplicationQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  const base =
    'w-full rounded-md border border-apply-border bg-apply-bg px-3 py-2.5 text-sm text-foreground placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 transition-shadow';
  return (
    <div className="flex flex-col gap-1.5">
      <Label.Root
        htmlFor={q.key}
        className="text-sm font-normal text-neutral-500"
      >
        {q.label}
      </Label.Root>
      {q.type === 'textarea' ? (
        <textarea
          id={q.key}
          rows={q.rows ?? 4}
          required={q.required}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`${base} resize-none`}
        />
      ) : (
        <input
          id={q.key}
          type={q.type}
          required={q.required}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={base}
        />
      )}
    </div>
  );
}

function CheckboxField({
  q,
  checked,
  onCheckedChange,
}: {
  q: ApplicationQuestion;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox.Root
        id={q.key}
        checked={checked}
        onCheckedChange={v => onCheckedChange(!!v)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border border-apply-border bg-apply-bg focus:outline-none focus:ring-1 focus:ring-neutral-400 data-[state=checked]:bg-foreground data-[state=checked]:border-foreground transition-colors"
      >
        <Checkbox.Indicator className="flex items-center justify-center">
          <Check className="h-2.5 w-2.5 text-background" strokeWidth={3} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <Label.Root
        htmlFor={q.key}
        className="text-sm font-normal text-neutral-500 leading-snug cursor-pointer"
      >
        {q.label}
      </Label.Root>
    </div>
  );
}

function SuccessView({ className }: { className: string }) {
  return (
    <main
      className={`${className} min-h-screen bg-apply-bg flex flex-col items-center justify-center px-5 text-center`}
    >
      <p className="text-xs tracking-widest uppercase text-neutral-400 mb-8">
        No Bad Company
      </p>
      <h1 className="font-playfair text-3xl text-foreground mb-4">
        You're on the list.
      </h1>
      <p className="text-sm text-neutral-500 max-w-xs">
        We review applications personally. If it's a fit, you'll hear from us.
      </p>
    </main>
  );
}

function AlreadyAppliedView({ className }: { className: string }) {
  return (
    <main
      className={`${className} min-h-screen bg-apply-bg flex flex-col items-center justify-center px-5 text-center`}
    >
      <p className="text-xs tracking-widest uppercase text-neutral-400 mb-8">
        No Bad Company
      </p>
      <h1 className="font-playfair text-3xl text-foreground mb-4">
        You're already on the list.
      </h1>
      <p className="text-sm text-neutral-500 max-w-xs">
        We have your application. We'll be in touch.
      </p>
    </main>
  );
}

export default function ApplyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const [form, setForm] = useState<Record<string, string | boolean>>(
    buildInitialState
  );
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function setField(key: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch(`/api/apply/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { status: string; message?: string };
      if (data.status === 'already_applied') {
        setStatus('already_applied');
      } else if (data.status === 'success') {
        setStatus('success');
      } else {
        setErrorMsg(data.message ?? 'Something went wrong. Please try again.');
        setStatus('error');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  }

  const fontClass = playfair.variable;

  if (status === 'success') return <SuccessView className={fontClass} />;
  if (status === 'already_applied') return <AlreadyAppliedView className={fontClass} />;

  const groups = groupQuestions(APPLY_QUESTIONS);

  return (
    <main
      className={`${fontClass} min-h-screen bg-apply-bg flex flex-col items-center px-5 py-16`}
    >
      <p className="text-xs tracking-widest uppercase text-neutral-400 mb-12">
        No Bad Company
      </p>

      <div className="w-full max-w-sm">
        <h1 className="font-playfair text-4xl text-foreground text-center mb-2 leading-tight">
          Apply for Membership
        </h1>
        <p className="text-sm text-neutral-500 text-center mb-10">
          Membership is by application.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {groups.map((group, gi) => {
            if (group.length === 2) {
              return (
                <div key={gi} className="grid grid-cols-2 gap-3">
                  {group.map(q => (
                    <InputField
                      key={q.key}
                      q={q}
                      value={form[q.key] as string}
                      onChange={v => setField(q.key, v)}
                    />
                  ))}
                </div>
              );
            }

            const q = group[0];

            if (q.type === 'checkbox') {
              return (
                <CheckboxField
                  key={q.key}
                  q={q}
                  checked={form[q.key] as boolean}
                  onCheckedChange={v => setField(q.key, v)}
                />
              );
            }

            return (
              <InputField
                key={q.key}
                q={q}
                value={form[q.key] as string}
                onChange={v => setField(q.key, v)}
              />
            );
          })}

          {status === 'error' && (
            <p className="text-sm text-red-500 text-center">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded bg-foreground text-background py-3 text-sm font-medium disabled:opacity-50 hover:opacity-80 transition-opacity mt-2"
          >
            {status === 'loading' ? 'Submitting…' : 'Apply'}
          </button>
        </form>
      </div>
    </main>
  );
}
