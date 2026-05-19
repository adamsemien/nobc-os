'use client';

import { useState } from 'react';
import type { EventAccess } from '@/lib/event-access-schema';
import type { ResolvedAccess, ViewerKind, StepId } from '@/lib/event-access';
import { resolveAccessForViewer, buildSteps } from '@/lib/event-access';
import type { WorkflowPath } from '@/lib/workflows/types';
import { TemplateEditorial } from './TemplateEditorial';
import { TemplateSplit } from './TemplateSplit';
import { TemplateMinimal } from './TemplateMinimal';
import { WorkflowPathsCard } from './WorkflowPathsCard';

export type TicketTierDTO = {
  id: string;
  name: string;
  description: string | null;
  memberPriceCents: number | null;
  nonMemberPriceCents: number | null;
  quantity: number;
  soldCount: number;
  heldCount: number;
};

export type CustomQuestionDTO = {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'date' | 'email' | 'phone';
  label: string;
  required: boolean;
  options?: string[];
  showToMember: boolean;
  showToGuest: boolean;
  whenInFlow: 'BEFORE_SUBMIT' | 'AFTER_PAYMENT' | 'BEFORE_APPROVAL';
};

export type EventDetailDTO = {
  eventId: string;
  slug: string;
  title: string;
  description: string | null;
  startAt: string | Date;
  endAt?: string | Date | null;
  location: string | null;
  mapsUrl: string | null;
  runOfShow: string | null;
  eventAccess: EventAccess;
  viewer: ViewerKind;
  resolved: ResolvedAccess;
  steps: StepId[];
  capacity: number | null;
  capacityUsedCount: number;
  showCapacity: boolean;
  plusOnesAllowed: boolean;
  heroImageUrl: string | null;
  memberApproved: boolean;
  memberId: string | null;
  memberQrCode: string | null;
  existingRsvp: { id: string; ticketStatus: string } | null;
  customQuestions: CustomQuestionDTO[];
  tiers: TicketTierDTO[];
  plusOneRsvp: { id: string; guestName: string; guestEmail: string } | null;
  template: 'editorial' | 'split' | 'minimal';
  isOperator: boolean;
  workflowPaths?: WorkflowPath[];
};

type PreviewViewer = 'guest' | 'member';

function deriveForViewer(event: EventDetailDTO, viewer: PreviewViewer): EventDetailDTO {
  const resolved = resolveAccessForViewer(event.eventAccess, viewer);
  const steps = buildSteps(
    resolved,
    viewer,
    event.customQuestions.map((q) => ({
      whenInFlow: q.whenInFlow,
      showToMember: q.showToMember,
      showToGuest: q.showToGuest,
    })),
  );
  return { ...event, viewer, resolved, steps };
}

function renderTemplate(event: EventDetailDTO) {
  const tpl =
    event.template === 'split' ? (
      <TemplateSplit event={event} />
    ) : event.template === 'minimal' ? (
      <TemplateMinimal event={event} />
    ) : (
      <TemplateEditorial event={event} />
    );

  if (!event.workflowPaths || event.workflowPaths.length === 0) return tpl;

  return (
    <>
      {tpl}
      <div className="mx-auto max-w-4xl px-5 sm:px-8 pb-10">
        <WorkflowPathsCard paths={event.workflowPaths} />
      </div>
    </>
  );
}

export function EventDetail({ event }: { event: EventDetailDTO }) {
  // Operators preview the page; everyone else sees their real resolved view.
  // Default to the guest path — NoBC has no members yet.
  const [previewViewer, setPreviewViewer] = useState<PreviewViewer>('guest');

  if (!event.isOperator) {
    return renderTemplate(event);
  }

  const displayEvent = deriveForViewer(event, previewViewer);

  return (
    <>
      <ViewToggle value={previewViewer} onChange={setPreviewViewer} />
      {renderTemplate(displayEvent)}
    </>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: PreviewViewer;
  onChange: (v: PreviewViewer) => void;
}) {
  return (
    <div className="fixed right-3 top-3 z-40 flex items-center gap-2 rounded-sm border border-[var(--apply-rule)] bg-[#FFFCF6]/95 px-2 py-1.5 shadow-[0_1px_4px_rgba(28,16,8,0.12)] backdrop-blur">
      <span className="pl-1 text-[9px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        Preview
      </span>
      <div className="flex items-center rounded-sm bg-[#F1ECE2] p-0.5">
        {(['guest', 'member'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`rounded-sm px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest transition-colors font-[family-name:var(--font-dm-sans)] ${
              value === v
                ? 'bg-[var(--nobc-red)] text-[var(--nobc-on-red)]'
                : 'text-[var(--apply-muted)] hover:text-[var(--apply-ink)]'
            }`}
          >
            {v === 'guest' ? 'Guest view' : 'Member view'}
          </button>
        ))}
      </div>
    </div>
  );
}
