import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getMemberWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import ProfileForm from './_components/ProfileForm';

export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect('/apply');

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) redirect('/apply');

  const member = await db.member.findFirst({
    where: { workspaceId, clerkUserId: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
      approvedAt: true,
    },
  });

  if (!member) {
    return (
      <div className="max-w-2xl mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-10">
        <p className="text-sm" style={{ color: 'var(--events-fg-soft)' }}>
          Your membership is being set up.
        </p>
      </div>
    );
  }

  const application = await db.application.findFirst({
    where: { workspaceId, email: member.email },
    orderBy: { createdAt: 'desc' },
    select: { city: true, neighborhood: true },
  });

  return (
    <div className="max-w-2xl mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-10">
      <ProfileForm
        member={{
          ...member,
          createdAt: member.createdAt.toISOString(),
          approvedAt: member.approvedAt?.toISOString() ?? null,
        }}
        application={application}
      />
    </div>
  );
}
