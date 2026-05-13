'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Playfair_Display } from 'next/font/google';
import * as Checkbox from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import {
  APPLY_QUESTIONS,
  APPLY_SECTIONS,
  type ApplicationQuestion,
} from '@/lib/apply-config';

const playfair = Playfair_Display({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-playfair-display',
});

type Status = 'idle' | 'loading' | 'already_applied' | 'error';

function buildInitialState(): Record<string, string | boolean> {
  return Object.fromEntries(
    APPLY_QUESTIONS.map(q => [q.key, q.type === 'checkbox' ? false : ''])
  );
}

const inputCls =
  'w-full border-0 border-b border-apply-rule bg-transparent py-3 text-base text-apply-ink placeholder:text-apply-muted/40 focus:outline-none focus:border-apply-ink transition-colors';

function InputField({
  q,
  value,
  onChange,
}: {
  q: ApplicationQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={q.key} className="block text-sm text-apply-muted mb-1">
        {q.label}
      </label>
      <input
        id={q.key}
        type={q.type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={q.required}
        className={inputCls}
      />
    </div>
  );
}

function TextareaField({
  q,
  value,
  onChange,
}: {
  q: ApplicationQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={q.key} className="block text-sm text-apply-muted mb-1">
        {q.label}
      </label>
      {q.note && (
        <span className="block text-xs text-apply-muted/60 mb-2">{q.note}</span>
      )}
      <textarea
        id={q.key}
        rows={q.rows ?? 4}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={q.required}
        minLength={q.minLength}
        className={`${inputCls} resize-none`}
      />
    </div>
  );
}

function RadioField({
  q,
  value,
  onChange,
}: {
  q: ApplicationQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="block text-sm text-apply-muted mb-3">{q.label}</span>
      <div className="flex gap-8">
        {(q.options ?? []).map(opt => (
          <label
            key={opt}
            className="flex items-center gap-2 cursor-pointer text-sm text-apply-ink"
          >
            <input
              type="radio"
              name={q.key}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              className="accent-apply-crimson"
            />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

function ConsentField({
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
        className="mt-0.5 h-4 w-4 shrink-0 border border-apply-rule bg-transparent focus:outline-none data-[state=checked]:bg-apply-crimson data-[state=checked]:border-apply-crimson transition-colors"
      >
        <Checkbox.Indicator className="flex items-center justify-center">
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <label
        htmlFor={q.key}
        className="text-sm text-apply-ink leading-snug cursor-pointer"
      >
        {q.label}
      </label>
    </div>
  );
}

function AlreadyAppliedView({ fontClass }: { fontClass: string }) {
  return (
    <main
      className={`${fontClass} min-h-screen bg-apply-cream flex flex-col items-center justify-center px-6 text-center`}
    >
      <p className="text-[11px] tracking-[0.25em] uppercase text-apply-muted mb-12">
        THE <span className="text-apply-crimson">NO BAD</span> COMPANY
      </p>
      <h1 className="font-playfair text-4xl text-apply-ink mb-4">
        You&rsquo;re already on the list.
      </h1>
      <p className="text-sm text-apply-muted max-w-xs">
        We have your application. We&rsquo;ll be in touch.
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
  const router = useRouter();

  const [form, setForm] = useState<Record<string, string | boolean>>(buildInitialState);
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
      const data = (await res.json()) as { status: string; message?: string };
      if (data.status === 'already_applied') {
        setStatus('already_applied');
      } else if (data.status === 'success') {
        router.push('/apply/thanks');
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

  if (status === 'already_applied') return <AlreadyAppliedView fontClass={fontClass} />;

  const questionsBySection = APPLY_SECTIONS.map(s => ({
    section: s,
    questions: APPLY_QUESTIONS.filter(q => q.section === s.key),
  }));

  return (
    <main className={`${fontClass} min-h-screen bg-apply-cream px-6 py-14 md:py-20`}>
      <div className="max-w-lg mx-auto">
        {/* Wordmark */}
        <p className="text-[11px] tracking-[0.25em] uppercase text-apply-ink mb-16">
          THE <span className="text-apply-crimson">NO BAD</span> COMPANY
        </p>

        {/* Headline */}
        <h1 className="font-playfair text-5xl leading-[1.15] text-apply-ink mb-5">
          Tell us who you are.
          <br />
          <em>Not what you do.</em>
        </h1>

        {/* Subhead */}
        <p className="text-sm text-apply-muted mb-16">
          Ten minutes. No r&eacute;sum&eacute;. We read every word.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="space-y-16">
            {questionsBySection.map(({ section, questions }) => (
              <div key={section.key}>
                {/* Section divider */}
                <div className="flex items-center gap-4 mb-8">
                  <div className="flex-1 border-t border-apply-rule" />
                  <p className="text-[10px] tracking-[0.2em] uppercase text-apply-muted shrink-0">
                    {section.label}
                  </p>
                  <div className="flex-1 border-t border-apply-rule" />
                </div>

                <div className="space-y-10">
                  {questions.map(q => {
                    if (q.type === 'checkbox') {
                      return (
                        <ConsentField
                          key={q.key}
                          q={q}
                          checked={form[q.key] as boolean}
                          onCheckedChange={v => setField(q.key, v)}
                        />
                      );
                    }
                    if (q.type === 'radio') {
                      return (
                        <RadioField
                          key={q.key}
                          q={q}
                          value={form[q.key] as string}
                          onChange={v => setField(q.key, v)}
                        />
                      );
                    }
                    if (q.type === 'textarea') {
                      return (
                        <TextareaField
                          key={q.key}
                          q={q}
                          value={form[q.key] as string}
                          onChange={v => setField(q.key, v)}
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
                </div>
              </div>
            ))}
          </div>

          {status === 'error' && (
            <p className="text-sm text-apply-crimson mt-6">{errorMsg}</p>
          )}

          <div className="mt-16 space-y-8">
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-apply-crimson text-white py-4 text-[11px] tracking-[0.2em] uppercase disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {status === 'loading' ? 'Sending…' : 'SEND IT →'}
            </button>

            <p className="text-xs text-apply-muted text-center pb-12">
              We read every word. You&rsquo;ll hear from us within two weeks. Sometimes sooner.
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
