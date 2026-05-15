import type { Prisma } from "@prisma/client"

export function whereNotGuest(): Prisma.MemberWhereInput {
  return { status: { not: "GUEST" } }
}
