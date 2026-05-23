import { auth } from '@clerk/nextjs/server';
import { getMemberWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import { HousePhoneClient } from './HousePhoneClient';

// Shared multi-operator SMS inbox. The operator layout already gates access to
// any workspace member (no owner-only check), so this page inherits that — any
// operator can open it and see/reply to every conversation.
export const dynamic = 'force-dynamic';

export default async function HousePhonePage() {
  const { userId } = await auth();
  const workspaceId = (await getMemberWorkspaceId(userId)) ?? '';

  const events = workspaceId
    ? await db.event.findMany({
        where: { workspaceId, status: 'PUBLISHED' },
        orderBy: { startAt: 'asc' },
        select: { id: true, title: true },
      })
    : [];

  return <HousePhoneClient events={events} />;
}
