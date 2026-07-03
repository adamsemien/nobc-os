/** ANSWER_QUESTIONS application bridge (Stage 17, M4).
 *
 *  Server-side resolution of "the identified member's own application" - the
 *  public API NEVER accepts a client-supplied application id (M4-D1). The
 *  ownership rule mirrors the verifier's: the application belongs to the
 *  member row or matches their email case-insensitively, always inside the
 *  session's workspace. Latest submission wins (M4-D2).
 */
import type { PrismaClient } from "@prisma/client";

export async function findApplicationForMember(
  db: PrismaClient,
  args: { workspaceId: string; memberId: string; email: string }
): Promise<string | null> {
  const app = await db.application.findFirst({
    where: {
      workspaceId: args.workspaceId,
      OR: [
        { memberId: args.memberId },
        { email: { equals: args.email, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return app?.id ?? null;
}
