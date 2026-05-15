import Dexie, { type Table } from 'dexie';

export interface CachedRsvp {
  id: string;
  memberId: string;
  firstName: string;
  lastName: string;
  email: string;
  memberQrCode: string | null;
  ticketStatus: string;
  checkedIn: boolean;
  checkedInAt: string | null;
}

export interface PendingCheckIn {
  rsvpId: string;
  checkedInAt: string;
  synced: boolean;
}

class CheckInDb extends Dexie {
  rsvps!: Table<CachedRsvp>;
  pending!: Table<PendingCheckIn>;

  constructor() {
    super('checkin');
    this.version(1).stores({
      rsvps: 'id, memberId, memberQrCode, checkedIn',
      pending: 'rsvpId, synced',
    });
  }
}

export const checkinDb = new CheckInDb();
