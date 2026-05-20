-- Membership tiers — replaces hardcoded top/mid/low buckets with operator-defined
-- ordered tier rows. Each tier optionally pins a 0–1 aiScore floor so the
-- existing gate semantics carry over.
-- Apply manually via `npx prisma migrate deploy` after reviewing.

CREATE TABLE "MembershipTier" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "minScore" DOUBLE PRECISION,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MembershipTier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MembershipTier_workspaceId_order_idx"
    ON "MembershipTier"("workspaceId", "order");

ALTER TABLE "MembershipTier"
    ADD CONSTRAINT "MembershipTier_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
