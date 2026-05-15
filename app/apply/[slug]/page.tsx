'use client';

import { use, useState } from 'react';
import Link from 'next/link';
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
  'w-full border-0 border-b border-apply-rule bg-transparent py-3 text-[15px] text-apply-ink placeholder:text-apply-muted/40 focus:outline-none focus:border-apply-ink transition-colors';

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
      <label htmlFor={q.key} className="block text-[15px] text-apply-muted mb-1">
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
      <label htmlFor={q.key} className="block text-[15px] text-apply-muted mb-1">
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
      <span className="block text-[15px] text-apply-muted mb-3">{q.label}</span>
      <div className="flex gap-8">
        {(q.options ?? []).map(opt => (
          <label
            key={opt}
            className="flex items-center gap-2 cursor-pointer text-[15px] text-apply-ink"
          >
            <input
              type="radio"
              name={q.key}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              className="accent-nobc-red"
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
        className="text-[15px] text-apply-ink leading-snug cursor-pointer"
      >
        {q.label}
      </label>
    </div>
  );
}

function SiteNav({ slug }: { slug: string }) {
  return (
    <nav className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5 sm:px-8">
      <Link
        href="/m/events"
        className="text-[0.65rem] font-normal uppercase tracking-[0.14em] text-events-ref-ink sm:text-[0.7rem] sm:tracking-[0.16em]"
      >
        <span>THE </span>
        <span className="text-events-ref-accent">NO BAD </span>
        <span>COMPANY</span>
      </Link>
      <div className="flex items-center gap-6 sm:gap-8">
        <Link
          href="/m/events"
          className="text-[0.65rem] font-normal uppercase tracking-[0.2em] text-events-ref-ink"
        >
          Events
        </Link>
        <Link
          href={`/apply/${slug}`}
          className="border border-nobc-red bg-nobc-red px-3 py-2 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-nobc-on-red transition-colors hover:bg-nobc-red-hover sm:px-4 sm:text-[0.65rem]"
          style={{ borderRadius: '4px' }}
          aria-current="page"
        >
          Apply
        </Link>
      </div>
    </nav>
  );
}

function SiteFooter({ slug }: { slug: string }) {
  return (
    <footer className="border-t border-events-ref-rule bg-apply-cream">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 sm:flex-row sm:items-start sm:justify-between sm:gap-8 sm:px-8 sm:py-12">
        <p className="text-[0.65rem] font-normal uppercase tracking-[0.14em] text-events-ref-ink sm:text-[0.7rem] sm:tracking-[0.16em]">
          <span>THE </span>
          <span className="text-events-ref-accent">NO BAD </span>
          <span>COMPANY</span>
        </p>
        <div className="flex flex-col gap-3 text-[0.65rem] font-normal uppercase tracking-[0.18em] text-events-ref-ink">
          <Link href="/m/events" className="w-fit hover:text-nobc-red">
            Programme
          </Link>
          <Link href={`/apply/${slug}`} className="w-fit hover:text-nobc-red" aria-current="page">
            Apply
          </Link>
        </div>
        <a
          href="mailto:hello@thenobadcompany.com"
          className="text-sm font-normal tracking-wide text-events-ref-muted underline-offset-4 hover:underline"
        >
          hello@thenobadcompany.com
        </a>
      </div>
      <div className="mx-auto max-w-6xl px-6 pb-8 sm:px-8">
        <p className="text-[0.6rem] font-normal uppercase tracking-[0.14em] text-events-ref-muted">
          <span>The </span>
          <span className="text-events-ref-accent">No Bad </span>
          <span>Company · By application</span>
        </p>
      </div>
    </footer>
  );
}

function AlreadyAppliedView({ fontClass, slug }: { fontClass: string; slug: string }) {
  return (
    <div className={`${fontClass} min-h-screen bg-apply-cream flex flex-col`}>
      <SiteNav slug={slug} />
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-playfair text-4xl text-apply-ink mb-4">
          You&rsquo;re already on the list.
        </h1>
        <p className="text-[15px] text-apply-muted max-w-xs">
          We have your application. We&rsquo;ll be in touch.
        </p>
      </main>
      <SiteFooter slug={slug} />
    </div>
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

  if (status === 'already_applied') return <AlreadyAppliedView fontClass={fontClass} slug={slug} />;

  const questionsBySection = APPLY_SECTIONS.map(s => ({
    section: s,
    questions: APPLY_QUESTIONS.filter(q => q.section === s.key),
  }));

  return (
    <div className={`${fontClass} min-h-screen bg-apply-cream flex flex-col`}>
      <SiteNav slug={slug} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 sm:px-8 md:py-16">
        <div className="mx-auto w-full max-w-3xl">
          {/* Breadcrumb */}
          <p className="text-[10px] tracking-[0.25em] uppercase text-apply-muted mb-12">
            MEMBERSHIP <span className="text-nobc-red mx-1.5">·</span> BY APPLICATION
          </p>

          {/* Headline */}
          <h1 className="font-playfair text-5xl sm:text-6xl lg:text-[72px] leading-[1.1] text-apply-ink mb-5">
            Tell us who you are.
            <br />
            <em>Not what you do.</em>
          </h1>

          {/* Subhead */}
          <p className="text-[15px] text-apply-muted mb-16">
            Ten minutes. No r&eacute;sum&eacute;. We read every word.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="space-y-16">
              {questionsBySection.map(({ section, questions }) => (
                <div key={section.key}>
                  {/* Section header */}
                  <p className="font-playfair italic text-[18px] text-apply-ink mb-8">
                    {section.label}
                  </p>

                  {section.key === 'basics' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-10">
                      {questions.map(q => (
                        <InputField
                          key={q.key}
                          q={q}
                          value={form[q.key] as string}
                          onChange={v => setField(q.key, v)}
                        />
                      ))}
                    </div>
                  ) : (
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
                  )}
                </div>
              ))}
            </div>

            {status === 'error' && (
              <p className="text-[15px] text-apply-crimson mt-6">{errorMsg}</p>
            )}

            <div className="mt-16 space-y-8">
              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-nobc-red py-4 text-[11px] font-medium uppercase tracking-[0.2em] text-nobc-on-red transition-colors hover:bg-nobc-red-hover disabled:opacity-50"
              >
                {status === 'loading' ? 'Sending…' : 'SEND IT →'}
              </button>

              <p className="text-xs text-apply-muted text-center pb-4">
                We read every word. You&rsquo;ll hear from us within two weeks. Sometimes sooner.
              </p>
            </div>
          </form>
        </div>
      </main>

      <SiteFooter slug={slug} />
    </div>
  );
}
