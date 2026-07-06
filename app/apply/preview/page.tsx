import type { Metadata } from 'next';
import { OperatorRole } from '@prisma/client';
import { requireRolePage } from '@/lib/operator-role';
import { verifyApplyPreviewToken } from '@/lib/apply-preview-token';
import MembershipForm from '../_components/MembershipForm';

export const metadata: Metadata = {
  title: 'apply preview - no bad company',
  robots: { index: false, follow: false },
};

/**
 * Preview of the application flow: the real MembershipForm, rendered from a
 * fixture (app/apply/_lib/preview-fixture.ts), with submit short-circuited to a
 * hardcoded local reveal — no Application/Member row, no scorer, no
 * tagApplication call (previewMode disables ALL DB effects).
 *
 * Two ways in:
 *   1. A valid signed `?t=` capability token (lib/apply-preview-token.ts, keyed
 *      by CHECKIN_SECRET, 14-day expiry) — renders with NO Clerk requirement.
 *      This is the reviewer link handed to Chloe.
 *   2. Otherwise, the operator-session gate (requireRolePage READ_ONLY floor:
 *      any operator, including a plain Clerk org member with no WorkspaceMember
 *      row). A non-operator with no valid token lands back on the real /apply.
 * robots noindex either way (metadata above).
 */
export default async function ApplyPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  if (verifyApplyPreviewToken(t)) {
    return <MembershipForm previewMode />;
  }
  await requireRolePage(OperatorRole.READ_ONLY, '/apply');
  return <MembershipForm previewMode />;
}
