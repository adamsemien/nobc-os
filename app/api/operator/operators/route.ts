import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * List operators in the current organization for mention autocomplete.
 * Returns Clerk user IDs + display names + image URLs (no emails).
 */
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!orgId) return NextResponse.json({ operators: [] });

  const client = await clerkClient();
  const memberships = await client.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    limit: 100,
  });

  const operators = memberships.data.map((m) => {
    const u = m.publicUserData;
    const fullName =
      [u?.firstName, u?.lastName].filter(Boolean).join(' ') ||
      u?.identifier ||
      'Operator';
    return {
      id: u?.userId ?? m.id,
      name: fullName,
      imageUrl: u?.imageUrl ?? null,
      role: m.role,
    };
  });

  return NextResponse.json({ operators });
}
