import { db } from '@/lib/db';
import type { MemberEngagementEventType, Prisma } from '@prisma/client';

export type LogEngagementEventParams = {
  workspaceId: string;
  memberId: string;
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
        memberId: params.memberId,
        eventType: params.eventType,
        eventId: params.eventId ?? null,
        metadata: params.metadata,
      },
    });
  } catch (err) {
    console.error(
      `[engagement] logEngagementEvent failed (type=${params.eventType} member=${params.memberId} workspace=${params.workspaceId}):`,
      err,
    );
  }
}
