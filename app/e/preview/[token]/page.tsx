/** True anonymous draft preview (Event Builder Rebuild, Phase B - Locked
 *  Decision 1).
 *
 *  Renders the EXACT /e/[slug] anon code path (same loader assembly, same
 *  shell, same EventDetail) against an event regardless of status - the
 *  publish-to-debug loop dies here. Two gates, one route:
 *
 *  - A signed preview token (lib/preview-token.ts) - what the builder iframe
 *    and shared review links carry. Event-scoped, expiring, HMAC-verified.
 *  - An operator session (STAFF+) with the path segment as a raw event id -
 *    the fallback when CHECKIN_SECRET is unset (dev) and for direct visits.
 *
 *  Never indexed, never linked publicly. The render itself is untouched -
 *  WYSIWYG means no ribbon, no banner, no chrome the guest would not see.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { OperatorRole } from "@prisma/client";
import { getMemberWorkspaceId } from "@/lib/auth";
import { getEffectiveRole, roleAtLeast } from "@/lib/operator-role";
import { assembleDraftPreviewDTO } from "@/lib/public-event-loader";
import { verifyPreviewToken } from "@/lib/preview-token";
import { EventDetail } from "@/app/m/events/[slug]/_components/EventDetail";
import { PublicEventShell } from "@/app/e/[slug]/_components/PublicEventShell";

export const metadata: Metadata = {
  title: "Preview - No Bad Company",
  robots: { index: false, follow: false },
};

/** Resolve the path segment to an authorized (workspaceId, eventId) scope. */
async function resolveScope(
  segment: string,
): Promise<{ workspaceId: string; eventId: string } | null> {
  const fromToken = verifyPreviewToken(segment);
  if (fromToken) return fromToken;

  // Operator-session fallback: the segment is a raw event id, honored only
  // for STAFF+ of the event's own workspace.
  const { userId } = await auth();
  if (!userId) return null;
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return null;
  const role = await getEffectiveRole(userId, workspaceId);
  if (!role || !roleAtLeast(role, OperatorRole.STAFF)) return null;
  return { workspaceId, eventId: segment };
}

export default async function DraftPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const scope = await resolveScope(token);
  if (!scope) notFound();

  const dto = await assembleDraftPreviewDTO(scope.workspaceId, scope.eventId);
  if (!dto) notFound();

  return (
    <PublicEventShell theme={dto.pageStyle.theme}>
      <EventDetail event={dto} />
    </PublicEventShell>
  );
}
