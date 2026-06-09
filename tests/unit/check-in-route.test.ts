import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Offline-capable check-in PWA endpoint (overnight QA audit, WARNING). It is
// explicitly designed to be safe to call multiple times, and runs a 3-statement
// transaction that increments member.totalEventsAttended — a re-sync that
// double-incremented would corrupt the attendance counts feeding intelligence.
// These assert the bearer gate, the ticket-status gate, and idempotency.

vi.mock('@/lib/db', () => ({
  db: {
    rSVP: { findUnique: vi.fn(), update: vi.fn() },
    member: { update: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(() => Promise.resolve([])),
  },
}));
vi.mock('@/lib/engagement', () => ({ logEngagementEvent: vi.fn(() => Promise.resolve()) }));

import { POST } from '@/app/api/check-in/[rsvpId]/route';
import { db } from '@/lib/db';

const SECRET = 'checkin_secret_test';
const ctx = (rsvpId = 'rsvp_1') => ({ params: Promise.resolve({ rsvpId }) });

function req(opts: { auth?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.auth !== undefined) headers.authorization = opts.auth;
  return new NextRequest('http://localhost/api/check-in/rsvp_1', { method: 'POST', headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CHECKIN_SECRET = SECRET;
});

describe('check-in route', () => {
  it('rejects a missing bearer with 401 and never reads the RSVP', async () => {
    const res = await POST(req(), ctx());
    expect(res.status).toBe(401);
    expect(db.rSVP.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a wrong bearer with 401', async () => {
    const res = await POST(req({ auth: 'Bearer nope' }), ctx());
    expect(res.status).toBe(401);
  });

  it('422s a ticket status outside the confirmed/held allow-list', async () => {
    vi.mocked(db.rSVP.findUnique).mockResolvedValue({
      id: 'rsvp_1', workspaceId: 'ws_1', memberId: 'mem_1', eventId: 'evt_1', checkedIn: false, ticketStatus: 'waitlisted',
    } as never);
    const res = await POST(req({ auth: `Bearer ${SECRET}` }), ctx());
    expect(res.status).toBe(422);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('checks in a fresh confirmed RSVP and increments attendance exactly once', async () => {
    vi.mocked(db.rSVP.findUnique).mockResolvedValue({
      id: 'rsvp_1', workspaceId: 'ws_1', memberId: 'mem_1', eventId: 'evt_1', checkedIn: false, ticketStatus: 'confirmed',
    } as never);
    const res = await POST(req({ auth: `Bearer ${SECRET}` }), ctx());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.alreadyCheckedIn).toBe(false);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.member.update).toHaveBeenCalledWith({
      where: { id: 'mem_1' },
      data: { totalEventsAttended: { increment: 1 }, lastAttendedDate: expect.any(Date) },
    });
  });

  it('is idempotent — a second call does NOT increment attendance again', async () => {
    vi.mocked(db.rSVP.findUnique).mockResolvedValue({
      id: 'rsvp_1', workspaceId: 'ws_1', memberId: 'mem_1', eventId: 'evt_1', checkedIn: true, ticketStatus: 'confirmed',
    } as never);
    const res = await POST(req({ auth: `Bearer ${SECRET}` }), ctx());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.alreadyCheckedIn).toBe(true);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.member.update).not.toHaveBeenCalled();
  });

  it('404s an unknown RSVP', async () => {
    vi.mocked(db.rSVP.findUnique).mockResolvedValue(null as never);
    const res = await POST(req({ auth: `Bearer ${SECRET}` }), ctx());
    expect(res.status).toBe(404);
  });
});
