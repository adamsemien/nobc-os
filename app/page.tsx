import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';

/** Root router.
 *
 *  - Signed-out users → /apply (public application form is the front door).
 *  - Approved members → /m (member portal home).
 *  - Operators (any user with a Workspace org membership, no Member record) → /operator. */
export default async function Home() {
  const { userId } = await auth();
  if (!userId) redirect('/apply');

  // Approved member → portal. If a user has BOTH an org membership and a
  // member record, members get priority — they're more likely to land here
  // from the member-side login flow.
  const member = await db.member.findFirst({
    where: { clerkUserId: userId, status: 'APPROVED' },
    select: { id: true },
  });
  if (member) redirect('/m');

  redirect('/operator');
}
