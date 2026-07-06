import { db } from '@/lib/db';
import type { MemberEngagementEventType, Prisma } from '@prisma/client';

export type LogEngagementEventParams = {
  workspaceId: string;
  /** Optional since Phase 2A: member-less humans (Person spine) accrue activity too. */
  memberId?: string | null;
  /** Person spine (Phase 2A): parallel Person pointer, written alongside memberId. */
  personId?: string | null;
  eventType: MemberEngagementEventType;
  eventId?: string;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Append a member engagement signal to MemberEngagementEvent.
 *
 * Fire-and-forget: call sites invoke this WITHOUT `await`, so it must never
 * throw and never block the request path. Any failure is logged (with enough
 * context to trace it) and swallowed — a lost analytics row must not break a
 * check-in, an RSVP, or a waitlist join.
 */
export async function logEngagementEvent(params: LogEngagementEventParams): Promise<void> {
  try {
    await db.memberEngagementEvent.create({
      data: {
        workspaceId: params.workspaceId,
        memberId: params.memberId ?? null,
        personId: params.personId ?? null,
        eventType: params.eventType,
        eventId: params.eventId ?? null,
        metadata: params.metadata,
      },
    });
  } catch (err) {
    console.error(
      `[engagement] logEngagementEvent failed (type=${params.eventType} member=${params.memberId ?? 'none'} person=${params.personId ?? 'none'} workspace=${params.workspaceId}):`,
      err,
    );
  }
}
