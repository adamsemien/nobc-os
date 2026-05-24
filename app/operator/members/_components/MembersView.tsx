'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui';
import { MembersBulkActions, type MembersBulkMember } from './MembersBulkActions';
import { AddMemberDrawer, type CreatedMember } from './AddMemberDrawer';

export function MembersView({ initialMembers }: { initialMembers: MembersBulkMember[] }) {
  const [members, setMembers] = useState<MembersBulkMember[]>(initialMembers);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  function handleCreated(m: CreatedMember) {
    // Optimistically prepend (the list is sorted by most recently added).
    setMembers((prev) => [
      {
        id: m.id,
        fullName: m.fullName,
        email: m.email,
        archetype: null,
        aiScore: null,
        totalEventsAttended: 0,
        lastAttendedDate: null,
        createdAt: m.createdAt,
        isVip: false,
        isBlocked: false,
      },
      ...prev,
    ]);
    setToast(`${m.fullName} added.`);
  }

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={`${members.length} approved · sorted by most recently added`}
        action={<AddMemberDrawer onCreated={handleCreated} />}
      />

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members yet"
          subtitle="Add a member directly, or approve an application."
          action={
            <Link
              href="/operator/applications"
              className="text-sm font-medium text-primary hover:underline"
            >
              Review applications →
            </Link>
          }
        />
      ) : (
        <MembersBulkActions members={members} />
      )}

      {toast ? (
        <div
          role="status"
          className="toast-in fixed bottom-6 right-6 z-50 overflow-hidden rounded-[8px] bg-text-primary px-4 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.25)]"
        >
          <span className="text-[12px] font-medium text-[var(--bg)]">{toast}</span>
          <span className="toast-progress absolute bottom-0 left-0 h-0.5 w-full bg-primary" />
        </div>
      ) : null}
    </>
  );
}
