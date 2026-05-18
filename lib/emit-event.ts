import { db } from './db';
import { getSvix } from './svix';
import type { AuditActorType } from '@prisma/client';

interface EmitEventInput {
  workspaceId: string;
  actorId?: string;
  /** Defaults to OPERATOR when omitted. Agent tools pass 'AGENT'. */
  actorType?: AuditActorType;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export async function emitEvent(input: EmitEventEventInput): Promise<void>;
export async function emitEvent(input: EmitEventInput): Promise<void> {
  const { workspaceId, actorId, actorType, action, entityType, entityId, metadata } = input;

  // Always write to local audit log
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
