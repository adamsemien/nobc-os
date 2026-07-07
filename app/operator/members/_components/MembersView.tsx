'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui';
import { MembersBulkActions, type MembersBulkMember } from './MembersBulkActions';
import { AddMemberDrawer, type CreatedMember } from './AddMemberDrawer';

export function MembersView({
  initialMembers,
  canAddMembers,
  canBulk,
  total,
}: {
  initialMembers: MembersBulkMember[];
  canAddMembers: boolean;
  canBulk: boolean;
  /** Matching rows in the workspace — may exceed the loaded (1000-row) slice. */
  total: number;
}) {
  const [members, setMembers] = useState<MembersBulkMember[]>(initialMembers);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  function handleCreated(m: CreatedMember) {
    // The roster deliberately excludes GUEST rows (Guest / Comp Access land as
    // GUEST) — don't prepend a row that vanishes on the next load; say where
    // it went instead.
    if (m.status === 'GUEST') {
      setToast(`${m.fullName} added with guest access — guests don't appear in this roster.`);
      return;
    }
    // Optimistically prepend (the list is sorted by most recently added).
    setMembers((prev) => [
      {
        id: m.id,
        fullName: m.fullName,
        email: m.email,
        companyName: null,
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
        subtitle={
          total > members.length
            ? `Showing the ${members.length.toLocaleString()} most recently added of ${total.toLocaleString()} people · search, filter, and sort below`
            : `${members.length} ${members.length === 1 ? 'person' : 'people'} · search, filter, and sort below`
        }
        action={
          <div className="flex items-center gap-3">
            <Link
              href="/operator/members/connectors"
              className="text-sm font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
            >
              Connectors
            </Link>
            {canAddMembers ? (
              <>
                <Link
                  href="/operator/members/import"
                  className="text-sm font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
                >
                  Import
                </Link>
                <AddMemberDrawer
                  onCreated={handleCreated}
                  members={members.map((mem) => ({ id: mem.id, fullName: mem.fullName, email: mem.email }))}
                />
              </>
            ) : null}
          </div>
        }
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
        <MembersBulkActions members={members} canEdit={canAddMembers} canBulk={canBulk} />
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
