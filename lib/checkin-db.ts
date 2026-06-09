import Dexie, { type Table } from 'dexie';

export interface CachedRsvp {
  id: string;
  memberId: string;
  firstName: string;
  lastName: string;
  email: string;
  memberQrCode: string | null;
  ticketStatus: string;
  paymentStatus: string | null;
  tierName: string | null;
  checkedIn: boolean;
  checkedInAt: string | null;
  isComp: boolean;
  compType: string | null;
}

export interface PendingCheckIn {
  rsvpId: string;
  checkedInAt: string;
  synced: boolean;
}

/** Small key/value store — holds the event-scoped check-in token so a cold,
 *  offline reopen of the PWA can still sync queued check-ins within the token's
 *  validity window (the server can't mint a fresh one with no connection). */
export interface CheckinMeta {
  key: string;
  value: string;
}

class CheckInDb extends Dexie {
  rsvps!: Table<CachedRsvp>;
  pending!: Table<PendingCheckIn>;
  meta!: Table<CheckinMeta>;

  constructor() {
    super('checkin');
    this.version(1).stores({
      rsvps: 'id, memberId, memberQrCode, checkedIn',
      pending: 'rsvpId, synced',
    });
    this.version(2).stores({
      rsvps: 'id, memberId, memberQrCode, checkedIn',
      pending: 'rsvpId, synced',
      meta: 'key',
    });
  }
}

export const checkinDb = new CheckInDb();
