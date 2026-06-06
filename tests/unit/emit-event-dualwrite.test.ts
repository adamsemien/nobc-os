import { describe, it, expect, vi, beforeEach } from 'vitest';

const { auditCreate, engagementCreate, workspaceFindUnique } = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  engagementCreate: vi.fn(),
  workspaceFindUnique: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    auditEvent: { create: auditCreate },
    memberEngagementEvent: { create: engagementCreate },
    workspace: { findUnique: workspaceFindUnique },
  },
}));
// No Svix in this test.
vi.mock('@/lib/svix', () => ({ getSvix: () => null }));

import { emitEvent } from '@/lib/emit-event';

beforeEach(() => {
  auditCreate.mockReset();
  engagementCreate.mockReset();
  workspaceFindUnique.mockReset();
  auditCreate.mockResolvedValue({ id: 'a1' });
  workspaceFindUnique.mockResolvedValue(null);
});

describe('emitEvent — CRM dual-write isolation', () => {
  it('writes the AuditEvent and, when engagement is present, the MemberEngagementEvent', async () => {
    engagementCreate.mockResolvedValue({ id: 'e1' });

    await emitEvent({
      workspaceId: 'w1',
      action: 'application.approved',
      entityType: 'APPLICATION',
      entityId: 'app1',
      engagement: { memberId: 'm1', eventType: 'application_approved', eventId: 'app1' },
    });

    expect(auditCreate).toHaveBeenCalledOnce();
    expect(engagementCreate).toHaveBeenCalledOnce();
    expect(engagementCreate.mock.calls[0][0].data).toMatchObject({
      memberId: 'm1',
      eventType: 'application_approved',
    });
  });

  it('does NOT write a MemberEngagementEvent when no engagement is provided', async () => {
    await emitEvent({ workspaceId: 'w1', action: 'event.published', entityType: 'EVENT', entityId: 'ev1' });
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(engagementCreate).not.toHaveBeenCalled();
  });

  it('a throwing engagement write NEVER breaks the AuditEvent emit', async () => {
    // e.g. the enum value is not yet migrated in the DB.
    engagementCreate.mockRejectedValue(new Error('invalid input value for enum: guest_created'));

    await expect(
      emitEvent({
        workspaceId: 'w1',
        action: 'application.approved',
        entityType: 'APPLICATION',
        entityId: 'app1',
        engagement: { memberId: 'm1', eventType: 'application_approved' },
      }),
    ).resolves.toBeUndefined();

    // The audit record was still written; the engagement failure was swallowed.
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(engagementCreate).toHaveBeenCalledOnce();
  });
});
