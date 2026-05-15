'use client';

import type { EventAccess } from '@/lib/event-access-schema';
import type { ResolvedAccess, ViewerKind, StepId } from '@/lib/event-access';
import { TemplateEditorial } from './TemplateEditorial';
import { TemplateSplit } from './TemplateSplit';
import { TemplateMinimal } from './TemplateMinimal';

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
  plusOneRsvp: { id: string; guestName: string; guestEmail: string } | null;
  template: 'editorial' | 'split' | 'minimal';
};

export function EventDetail({ event }: { event: EventDetailDTO }) {
  if (event.template === 'split') return <TemplateSplit event={event} />;
  if (event.template === 'minimal') return <TemplateMinimal event={event} />;
  return <TemplateEditorial event={event} />;
}
