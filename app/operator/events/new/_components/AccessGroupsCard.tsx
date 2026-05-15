'use client';

import type {
  EventAccess,
  FlowStep,
  RegistrationStyle,
} from '@/lib/event-access-schema';
import type { AccessQuestion } from '@/lib/registration-fields';
import { FlowBuilder } from './FlowBuilder';
import { FlowPreview } from './FlowPreview';

type Props = {
  value: EventAccess;
  onChange: (v: EventAccess) => void;
  questions: AccessQuestion[];
  onQuestionsChange: (q: AccessQuestion[]) => void;
  eventTitle: string;
};

export function AccessGroupsCard({
  value,
  onChange,
  questions,
  onQuestionsChange,
  eventTitle,
}: Props) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_268px]">
      <div className="flex flex-col gap-4">
        <AccessGroup
          title="Member Access"
          subtitle="For approved NoBC members"
          enabled={value.member.enabled}
          onToggle={(b) =>
            onChange({ ...value, member: { ...value.member, enabled: b } })
          }
        >
          <FlowBuilder
            group="member"
            flow={value.member.flow}
            onFlowChange={(flow: FlowStep[]) =>
              onChange({ ...value, member: { ...value.member, flow } })
            }
            priceCents={value.member.priceCents}
            onPriceChange={(cents) =>
              onChange({ ...value, member: { ...value.member, priceCents: cents } })
            }
            questions={questions}
            onQuestionsChange={onQuestionsChange}
          />
        </AccessGroup>

        <AccessGroup
          title="Guest Access"
          subtitle="For everyone else"
          enabled={value.guest.enabled}
          onToggle={(b) =>
            onChange({ ...value, guest: { ...value.guest, enabled: b } })
          }
        >
          <FlowBuilder
            group="guest"
            flow={value.guest.flow}
            onFlowChange={(flow: FlowStep[]) =>
              onChange({ ...value, guest: { ...value.guest, flow } })
            }
            priceCents={value.guest.priceCents}
            onPriceChange={(cents) =>
              onChange({ ...value, guest: { ...value.guest, priceCents: cents } })
            }
            questions={questions}
            onQuestionsChange={onQuestionsChange}
          />
        </AccessGroup>

        <AccessGroup
          title="Comp Access"
          subtitle="Complimentary tickets you issue manually"
          enabled={value.comp.enabled}
          onToggle={(b) =>
            onChange({ ...value, comp: { ...value.comp, enabled: b } })
          }
        >
          <BudgetCapField
            value={value.comp.budgetCap}
            onChange={(n) =>
              onChange({ ...value, comp: { ...value.comp, budgetCap: n } })
            }
          />
        </AccessGroup>

        <RegistrationStyleCard
          value={value.registrationStyle ?? 'all_at_once'}
          onChange={(s) => onChange({ ...value, registrationStyle: s })}
        />
      </div>

      {/* Live preview */}
      <div className="h-fit lg:sticky lg:top-4">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          Live preview
        </p>
        <FlowPreview
          access={value}
          questions={questions}
          eventTitle={eventTitle}
        />
      </div>
    </div>
  );
}

function AccessGroup({
  title,
  subtitle,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  enabled: boolean;
  onToggle: (b: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-[var(--apply-rule)] bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-[22px] font-normal leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            {subtitle}
          </p>
        </div>
        <Toggle checked={enabled} onChange={onToggle} />
      </div>
      {enabled && <div className="mt-5">{children}</div>}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-[var(--nobc-red)]' : 'bg-[var(--apply-rule)]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function RegistrationStyleCard({
  value,
  onChange,
}: {
  value: RegistrationStyle;
  onChange: (s: RegistrationStyle) => void;
}) {
  const options: { key: RegistrationStyle; label: string; hint: string }[] = [
    {
      key: 'all_at_once',
      label: 'Show all questions at once',
      hint: 'One screen, single submit. Best for 1–3 questions.',
    },
    {
      key: 'one_at_a_time',
      label: 'One question at a time',
      hint: 'Typeform-style, one per screen. Best for longer flows.',
    },
  ];
  return (
    <div className="rounded-sm border border-[var(--apply-rule)] bg-card p-5">
      <h3 className="text-[22px] font-normal leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
        Registration style
      </h3>
      <p className="mt-0.5 text-xs text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        How questions appear in the checkout
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {options.map((o) => {
          const active = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              className={`rounded-sm border px-3 py-2.5 text-left transition-colors ${
                active
                  ? 'border-[var(--nobc-red)] bg-primary-soft'
                  : 'border-[var(--apply-rule)] bg-card hover:border-[var(--nobc-red)]'
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                    active
                      ? 'border-[var(--nobc-red)]'
                      : 'border-[var(--apply-rule)]'
                  }`}
                >
                  {active && (
                    <span className="h-2 w-2 rounded-full bg-[var(--nobc-red)]" />
                  )}
                </span>
                <span className="text-sm font-medium text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                  {o.label}
                </span>
              </span>
              <span className="mt-0.5 block pl-6 text-xs text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                {o.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BudgetCapField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        Comp budget (optional max)
      </label>
      <input
        type="number"
        min={0}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : Math.max(0, parseInt(v, 10) || 0));
        }}
        className="w-full rounded-sm border border-[var(--apply-rule)] bg-card px-3 py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
        placeholder="No cap"
      />
    </div>
  );
}
