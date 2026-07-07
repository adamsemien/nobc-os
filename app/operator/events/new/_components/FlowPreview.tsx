'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { EventAccess, GroupAccess } from '@/lib/event-access-schema';
import { type AccessQuestion, appliesToMember, appliesToGuest } from '@/lib/registration-fields';

type Group = 'member' | 'guest';

type Props = {
  access: EventAccess;
  questions: AccessQuestion[];
  eventTitle: string;
};

type Screen =
  | { kind: 'register' }
  | { kind: 'fields' }
  | { kind: 'pay' }
  | { kind: 'gate' }
  | { kind: 'confirm' }
  | { kind: 'referral' }
  | { kind: 'age' }
  | { kind: 'question' }
  | { kind: 'done' };

function buildScreens(group: GroupAccess): Screen[] {
  const screens: Screen[] = [{ kind: 'register' }];
  for (const gate of group.gates) {
    switch (gate.type) {
      case 'application':
        screens.push({ kind: 'fields' });
        if (gate.approvalRequired) screens.push({ kind: 'gate' });
        break;
      case 'ticket':
        screens.push({ kind: 'pay' });
        break;
      case 'rsvp':
        screens.push({ kind: 'confirm' });
        break;
      case 'referral':
        screens.push({ kind: 'referral' });
        break;
      case 'waitlist':
        screens.push({ kind: 'gate' });
        break;
      case 'age_check':
        screens.push({ kind: 'age' });
        break;
      case 'custom_question':
        screens.push({ kind: 'question' });
        break;
    }
  }
  screens.push({ kind: 'done' });
  return screens;
}

function priceLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
}

export function FlowPreview({ access, questions, eventTitle }: Props) {
  const [view, setView] = useState<Group>('guest');
  const [idx, setIdx] = useState(0);

  const group = view === 'member' ? access.member : access.guest;
  const screens = group.enabled ? buildScreens(group) : [];
  const safeIdx = Math.min(idx, Math.max(0, screens.length - 1));
  const screen = screens[safeIdx];
  const groupQuestions = questions.filter(view === 'member' ? appliesToMember : appliesToGuest);
  const hasGate = group.gates.some((g) => g.type === 'application' || g.type === 'waitlist');
  const title = eventTitle.trim() || 'Your Event';
  const memberPrice = group.priceCents;

  return (
    <div className="flex flex-col gap-3">
      {/* View toggle */}
      <div className="flex items-center rounded-sm bg-raised p-0.5">
        {(['guest', 'member'] as const).map((v) => (
          <button key={v} type="button" onClick={() => { setView(v); setIdx(0); }}
            className={`flex-1 rounded-sm px-2 py-1 text-[10px] font-medium uppercase tracking-widest transition-colors font-[family-name:var(--font-dm-sans)] ${
              view === v ? 'bg-[var(--nobc-red)] text-[var(--nobc-on-red)]' : 'text-[var(--apply-muted)] hover:text-[var(--apply-ink)]'
            }`}>
            {v === 'guest' ? 'Guest view' : 'Member view'}
          </button>
        ))}
      </div>

      {/* Phone frame */}
      <div className="member-preview-scope mx-auto w-full max-w-[248px] rounded-[26px] border-[6px] border-[#1C1008] bg-[#1C1008] shadow-[0_8px_24px_rgba(28,16,8,0.22)]">
        <div className="relative overflow-hidden rounded-[20px] bg-[#F9F7F2]">
          <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-[#1C1008]/20" aria-hidden />
          <div className="flex min-h-[368px] flex-col px-4 pb-4 pt-3">
            {!group.enabled ? (
              <div className="flex flex-1 items-center justify-center text-center">
                <p className="text-[11px] uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                  {view === 'member' ? 'Member' : 'Guest'} access is off
                </p>
              </div>
            ) : (
              <>
                <p className="text-center text-[8px] font-medium uppercase tracking-[0.2em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                  {title}
                </p>
                <div className="mt-2 flex items-center justify-center gap-1">
                  {screens.map((_, i) => (
                    <span key={i} className={`h-1 w-4 rounded-full ${i <= safeIdx ? 'bg-[var(--nobc-red)]' : 'bg-[var(--apply-rule)]'}`} />
                  ))}
                </div>

                <div className="mt-4 flex-1">
                  {screen?.kind === 'register' && <RegisterScreen />}
                  {screen?.kind === 'fields' && <FieldsScreen questions={groupQuestions} />}
                  {screen?.kind === 'pay' && <PayScreen price={priceLabel(memberPrice)} />}
                  {screen?.kind === 'gate' && <GateScreen />}
                  {screen?.kind === 'confirm' && <ConfirmScreen title={title} />}
                  {screen?.kind === 'referral' && <ReferralScreen />}
                  {screen?.kind === 'age' && <AgeScreen />}
                  {screen?.kind === 'question' && <QuestionScreen />}
                  {screen?.kind === 'done' && <DoneScreen title={title} hasGate={hasGate} />}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stepper */}
      {screens.length > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={safeIdx === 0}
            className="text-[var(--apply-muted)] disabled:opacity-30 hover:text-[var(--nobc-red)]" aria-label="Previous screen">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[10px] uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            {safeIdx + 1} / {screens.length}
          </span>
          <button type="button" onClick={() => setIdx((i) => Math.min(screens.length - 1, i + 1))} disabled={safeIdx >= screens.length - 1}
            className="text-[var(--apply-muted)] disabled:opacity-30 hover:text-[var(--nobc-red)]" aria-label="Next screen">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Screen components ───────────────────────────────────────────────────────

function ScreenTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[18px] leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
      {children}
    </h4>
  );
}

function MockInput({ label }: { label: string }) {
  return (
    <div>
      <p className="mb-1 text-[9px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">{label}</p>
      <div className="h-7 rounded-sm border border-[var(--apply-rule)] bg-white" />
    </div>
  );
}

function MockButton({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-sm bg-[var(--nobc-red)] py-2 text-center text-[9px] font-medium uppercase tracking-widest text-[var(--nobc-on-red)] font-[family-name:var(--font-dm-sans)]">
      {children}
    </div>
  );
}

function RegisterScreen() {
  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle>Register</ScreenTitle>
      <MockInput label="Your name" />
      <MockInput label="Email" />
      <div className="mt-1"><MockButton>Continue →</MockButton></div>
    </div>
  );
}

function FieldsScreen({ questions }: { questions: AccessQuestion[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <ScreenTitle>A few questions</ScreenTitle>
      {questions.length === 0 ? (
        <p className="text-[9px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">No fields yet.</p>
      ) : (
        questions.slice(0, 4).map((q) =>
          q.type === 'checkbox' || q.type === 'yes_no' ? (
            <div key={q.tempId} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm border border-[var(--apply-rule)] bg-white" />
              <span className="text-[9px] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">{q.label}</span>
            </div>
          ) : (
            <MockInput key={q.tempId} label={q.label} />
          ),
        )
      )}
      <div className="mt-1"><MockButton>Continue →</MockButton></div>
    </div>
  );
}

function PayScreen({ price }: { price: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <ScreenTitle>Payment</ScreenTitle>
      <div className="rounded-sm bg-[#1C1008] py-2 text-center text-[10px] font-medium text-white font-[family-name:var(--font-dm-sans)]">
        Pay
      </div>
      <div className="flex items-center gap-2">
        <span className="h-px flex-1 bg-[var(--apply-rule)]" />
        <span className="text-[8px] uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">or pay by card</span>
        <span className="h-px flex-1 bg-[var(--apply-rule)]" />
      </div>
      <div className="h-7 rounded-sm border border-[var(--apply-rule)] bg-white" />
      <div className="flex items-center justify-between text-[9px] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
        <span className="text-[var(--apply-muted)]">Total</span>
        <span className="font-medium">{price}</span>
      </div>
      <MockButton>Complete registration</MockButton>
    </div>
  );
}

function GateScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--apply-rule)] text-[var(--apply-muted)]">⏳</div>
      <ScreenTitle>Under review</ScreenTitle>
      <p className="text-[9px] leading-relaxed text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        Your request is being reviewed. You&rsquo;ll hear back shortly.
      </p>
    </div>
  );
}

function ConfirmScreen({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <ScreenTitle>You&rsquo;re in</ScreenTitle>
      <p className="text-[9px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">Confirm your spot at {title}.</p>
      <MockButton>Reserve My Spot</MockButton>
    </div>
  );
}

function ReferralScreen() {
  return (
    <div className="flex flex-col gap-2.5">
      <ScreenTitle>Referred by</ScreenTitle>
      <p className="text-[9px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">Enter the name of the member who referred you.</p>
      <MockInput label="Member name" />
      <MockButton>Continue →</MockButton>
    </div>
  );
}

function AgeScreen() {
  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle>Age confirmation</ScreenTitle>
      <p className="text-[9px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">This event is 18+.</p>
      <label className="flex items-center gap-1.5 text-[9px] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
        <span className="h-3 w-3 rounded-sm border border-[var(--apply-rule)] bg-white" />
        I confirm I am 18 or older
      </label>
      <MockButton>Continue →</MockButton>
    </div>
  );
}

function QuestionScreen() {
  return (
    <div className="flex flex-col gap-2.5">
      <ScreenTitle>One quick question</ScreenTitle>
      <MockInput label="Your answer" />
      <MockButton>Continue →</MockButton>
    </div>
  );
}

function DoneScreen({ title, hasGate }: { title: string; hasGate: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--nobc-red)] text-sm text-[var(--nobc-on-red)]">✓</div>
      <p className="text-[9px] font-medium uppercase tracking-widest text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
        {hasGate ? 'Request received' : "You're in"}
      </p>
      <h4 className="text-[20px] leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">{title}</h4>
    </div>
  );
}
