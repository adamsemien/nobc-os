import { db } from './db';
import { getSvix } from './svix';
import { logEngagementEvent } from './engagement';
import type { AuditActorType, MemberEngagementEventType } from '@prisma/client';

interface EmitEventInput {
  workspaceId: string;
  actorId?: string;
  /** Defaults to OPERATOR when omitted. Agent tools pass 'AGENT'. */
  actorType?: AuditActorType;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, string | number | boolean | null>;
  /**
   * Optional CRM dual-write. When a memberId is resolvable at the call site, the
   * same operational event is also appended to the member's engagement timeline
   * (MemberEngagementEvent). This is the canonical funnel/timeline source.
   *
   * Isolated by design: the AuditEvent write happens first and unconditionally,
   * and logEngagementEvent swallows its own errors — so a failing engagement
   * write (e.g. an enum value not yet migrated) can never break the audit emit.
   */
  engagement?: {
    memberId: string;
    eventType: MemberEngagementEventType;
    eventId?: string;
  };
}

export async function emitEvent(input: EmitEventEventInput): Promise<void>;
export async function emitEvent(input: EmitEventInput): Promise<void> {
  const { workspaceId, actorId, actorType, action, entityType, entityId, metadata, engagement } = input;

  // Always write to local audit log — this is the compliance record and must
  // never be gated on the CRM dual-write below.
  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId,
      actorType,
      action,
      entityType,
      entityId,
      metadata: metadata ?? undefined,
    },
  });

  // CRM dual-write — fire only when a member is known. logEngagementEvent is
  // self-catching, so this cannot throw past here.
  if (engagement) {
    await logEngagementEvent({
      workspaceId,
      memberId: engagement.memberId,
      eventType: engagement.eventType,
      eventId: engagement.eventId,
      metadata: metadata ?? undefined,
    });
  }

  // Deliver to Svix if workspace has a svixAppId and Svix is configured
  const svix = getSvix();
  if (!svix) return;

  try {
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { svixAppId: true },
    });
    if (!workspace?.svixAppId) return;

    await svix.message.create(workspace.svixAppId, {
      eventType: action,
      payload: {
        type: action,
        workspaceId,
        entityType,
        entityId,
        actorId: actorId ?? null,
        actorType: actorType ?? null,
        metadata: metadata ?? null,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[emit-event] Svix delivery failed:', err);
  }
}

// Allow old name pattern used elsewhere (type alias to avoid duplication)
type EmitEventEventInput = EmitEventInput;
