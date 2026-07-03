import type { Metadata } from 'next';
import { OperatorRole } from '@prisma/client';
import { requireRolePage } from '@/lib/operator-role';
import MembershipForm from '../_components/MembershipForm';

export const metadata: Metadata = {
  title: 'apply preview - no bad company',
  robots: { index: false, follow: false },
};

/**
 * Operator-only preview of the application flow: the real MembershipForm,
 * rendered from a fixture (app/apply/_lib/preview-fixture.ts), with submit
 * short-circuited to a hardcoded local reveal — no Application/Member row,
 * no scorer, no tagApplication call. Gated by the same requireRolePage used
 * by the operator dashboard (READ_ONLY floor: any operator, including a
 * plain Clerk org member with no WorkspaceMember row, can view it). A
 * non-operator lands back on the real /apply flow.
 */
export default async function ApplyPreviewPage() {
  await requireRolePage(OperatorRole.READ_ONLY, '/apply');
  return <MembershipForm previewMode />;
}
