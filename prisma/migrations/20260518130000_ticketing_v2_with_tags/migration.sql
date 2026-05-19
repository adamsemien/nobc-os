-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('public', 'members_only', 'unlisted');

-- CreateEnum
CREATE TYPE "ServiceFeeMode" AS ENUM ('absorb', 'pass_stripe_only', 'pass_stripe_plus_markup', 'flat_per_ticket');

-- CreateEnum
CREATE TYPE "RefundPolicy" AS ENUM ('none', 'window', 'credit');

-- CreateEnum
CREATE TYPE "WaitlistPromotion" AS ENUM ('none', 'same_tier_only', 'next_tier_current_price', 'next_tier_held_price');

-- CreateEnum
CREATE TYPE "TierVisibility" AS ENUM ('public', 'secret_link', 'members_only');

-- CreateEnum
CREATE TYPE "TierTrigger" AS ENUM ('previous_sold_out', 'date', 'manual');

-- CreateEnum
CREATE TYPE "AccessTokenType" AS ENUM ('secret_link', 'comp');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('percent', 'flat', 'comp');

-- CreateEnum
CREATE TYPE "TagEntityType" AS ENUM ('member', 'event', 'series', 'order', 'application', 'rsvp');

-- CreateEnum
CREATE TYPE "TagSource" AS ENUM ('manual', 'tenur', 'activecampaign', 'beehiiv', 'system');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE 'COMP';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "defaultRefundPolicy" "RefundPolicy" NOT NULL DEFAULT 'window',
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "groupBuyEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "instanceNumber" INTEGER,
ADD COLUMN     "publishesAt" TIMESTAMP(3),
ADD COLUMN     "recurrenceRule" TEXT,
ADD COLUMN     "requireAttendeeDetailsPerTicket" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "serviceFeeFlatCents" INTEGER,
ADD COLUMN     "serviceFeeMode" "ServiceFeeMode" NOT NULL DEFAULT 'absorb',
ADD COLUMN     "serviceFeePercentBps" INTEGER,
ADD COLUMN     "visibility" "EventVisibility" NOT NULL DEFAULT 'public',
ADD COLUMN     "waitlistPromotion" "WaitlistPromotion" NOT NULL DEFAULT 'same_tier_only';

-- AlterTable
ALTER TABLE "RSVP" ADD COLUMN     "accessTokenId" TEXT,
ADD COLUMN     "attendeeCustomAnswers" JSONB,
ADD COLUMN     "attendeeEmail" TEXT,
ADD COLUMN     "attendeeName" TEXT,
ADD COLUMN     "attendeePhone" TEXT,
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "tierId" TEXT;

-- CreateTable
CREATE TABLE "EventSeries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "recurrenceRule" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "count" INTEGER,
    "defaultHeroImageAssetId" TEXT,
    "defaultDescription" TEXT,
    "defaultAccessMode" "EventAccessMode" NOT NULL DEFAULT 'OPEN',
    "defaultPlusOnesAllowed" BOOLEAN NOT NULL DEFAULT false,
    "defaultRefundPolicy" "RefundPolicy" NOT NULL DEFAULT 'window',
    "brandColorHex" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesSponsor" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "sponsorBrandId" TEXT NOT NULL,
    "tier" TEXT,
    "startInstance" INTEGER,
    "endInstance" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeriesSponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTier" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT,
    "seriesId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "perksJson" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "memberPriceCents" INTEGER,
    "nonMemberPriceCents" INTEGER,
    "quantity" INTEGER NOT NULL,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "heldCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "visibility" "TierVisibility" NOT NULL DEFAULT 'public',
    "autoOpenTrigger" "TierTrigger",
    "previousTierId" TEXT,
    "minPerOrder" INTEGER NOT NULL DEFAULT 1,
    "maxPerOrder" INTEGER NOT NULL DEFAULT 10,
    "refundPolicy" "RefundPolicy",
    "refundWindowHours" INTEGER,
    "manuallyOpened" BOOLEAN NOT NULL DEFAULT false,
    "manuallyClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketHold" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "eventId" TEXT,
    "quantity" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT,

    CONSTRAINT "TicketHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT,
    "seriesId" TEXT,
    "buyerMemberId" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "subtotalCents" INTEGER NOT NULL,
    "serviceFeeCents" INTEGER NOT NULL DEFAULT 0,
    "promoDiscountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "stripePaymentIntentId" TEXT,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "promoCodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessToken" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT,
    "tierId" TEXT,
    "type" "AccessTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "compAttendeeName" TEXT,
    "compAttendeeEmail" TEXT,
    "createdByPersonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT,
    "seriesId" TEXT,
    "tierId" TEXT,
    "code" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "maxUsesPerCustomer" INTEGER,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountSavedCents" INTEGER NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT,
    "color" TEXT,
    "description" TEXT,
    "externalSource" "TagSource" NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityTag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "entityType" "TagEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "appliedBy" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorBrandProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icp" TEXT,
    "icpTags" TEXT[],
    "category" TEXT,
    "primaryColor" TEXT,
    "logoAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorBrandProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedAsset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sponsorBrandId" TEXT,
    "type" TEXT NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "magicLinkUrl" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBySession" TEXT,
    "expiresAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,

    CONSTRAINT "GeneratedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventSeries_workspaceId_idx" ON "EventSeries"("workspaceId");

-- CreateIndex
CREATE INDEX "EventSeries_active_idx" ON "EventSeries"("active");

-- CreateIndex
CREATE INDEX "SeriesSponsor_workspaceId_idx" ON "SeriesSponsor"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesSponsor_seriesId_sponsorBrandId_key" ON "SeriesSponsor"("seriesId", "sponsorBrandId");

-- CreateIndex
CREATE INDEX "TicketTier_workspaceId_eventId_idx" ON "TicketTier"("workspaceId", "eventId");

-- CreateIndex
CREATE INDEX "TicketTier_workspaceId_seriesId_idx" ON "TicketTier"("workspaceId", "seriesId");

-- CreateIndex
CREATE INDEX "TicketTier_visibility_idx" ON "TicketTier"("visibility");

-- CreateIndex
CREATE INDEX "TicketHold_workspaceId_idx" ON "TicketHold"("workspaceId");

-- CreateIndex
CREATE INDEX "TicketHold_tierId_expiresAt_idx" ON "TicketHold"("tierId", "expiresAt");

-- CreateIndex
CREATE INDEX "TicketHold_expiresAt_idx" ON "TicketHold"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripePaymentIntentId_key" ON "Order"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Order_workspaceId_eventId_idx" ON "Order"("workspaceId", "eventId");

-- CreateIndex
CREATE INDEX "Order_workspaceId_seriesId_idx" ON "Order"("workspaceId", "seriesId");

-- CreateIndex
CREATE INDEX "Order_buyerMemberId_idx" ON "Order"("buyerMemberId");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AccessToken_tokenHash_key" ON "AccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccessToken_workspaceId_idx" ON "AccessToken"("workspaceId");

-- CreateIndex
CREATE INDEX "AccessToken_eventId_idx" ON "AccessToken"("eventId");

-- CreateIndex
CREATE INDEX "AccessToken_tierId_idx" ON "AccessToken"("tierId");

-- CreateIndex
CREATE INDEX "AccessToken_type_idx" ON "AccessToken"("type");

-- CreateIndex
CREATE INDEX "PromoCode_workspaceId_idx" ON "PromoCode"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_eventId_code_key" ON "PromoCode"("eventId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_seriesId_code_key" ON "PromoCode"("seriesId", "code");

-- CreateIndex
CREATE INDEX "PromoRedemption_workspaceId_idx" ON "PromoRedemption"("workspaceId");

-- CreateIndex
CREATE INDEX "PromoRedemption_promoCodeId_idx" ON "PromoRedemption"("promoCodeId");

-- CreateIndex
CREATE INDEX "PromoRedemption_orderId_idx" ON "PromoRedemption"("orderId");

-- CreateIndex
CREATE INDEX "Tag_workspaceId_idx" ON "Tag"("workspaceId");

-- CreateIndex
CREATE INDEX "Tag_externalSource_idx" ON "Tag"("externalSource");

-- CreateIndex
CREATE INDEX "Tag_category_idx" ON "Tag"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_workspaceId_slug_key" ON "Tag"("workspaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_workspaceId_externalSource_externalId_key" ON "Tag"("workspaceId", "externalSource", "externalId");

-- CreateIndex
CREATE INDEX "EntityTag_workspaceId_entityType_entityId_idx" ON "EntityTag"("workspaceId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "EntityTag_tagId_idx" ON "EntityTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityTag_tagId_entityType_entityId_key" ON "EntityTag"("tagId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "SponsorBrandProfile_workspaceId_idx" ON "SponsorBrandProfile"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedAsset_magicLinkUrl_key" ON "GeneratedAsset"("magicLinkUrl");

-- CreateIndex
CREATE INDEX "GeneratedAsset_workspaceId_idx" ON "GeneratedAsset"("workspaceId");

-- CreateIndex
CREATE INDEX "Event_visibility_idx" ON "Event"("visibility");

-- CreateIndex
CREATE INDEX "Event_featured_idx" ON "Event"("featured");

-- CreateIndex
CREATE INDEX "Event_publishesAt_idx" ON "Event"("publishesAt");

-- CreateIndex
CREATE INDEX "Event_seriesId_idx" ON "Event"("seriesId");

-- CreateIndex
CREATE INDEX "RSVP_orderId_idx" ON "RSVP"("orderId");

-- CreateIndex
CREATE INDEX "RSVP_tierId_idx" ON "RSVP"("tierId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RSVP" ADD CONSTRAINT "RSVP_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RSVP" ADD CONSTRAINT "RSVP_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "TicketTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RSVP" ADD CONSTRAINT "RSVP_accessTokenId_fkey" FOREIGN KEY ("accessTokenId") REFERENCES "AccessToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesSponsor" ADD CONSTRAINT "SeriesSponsor_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesSponsor" ADD CONSTRAINT "SeriesSponsor_sponsorBrandId_fkey" FOREIGN KEY ("sponsorBrandId") REFERENCES "SponsorBrandProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTier" ADD CONSTRAINT "TicketTier_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTier" ADD CONSTRAINT "TicketTier_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTier" ADD CONSTRAINT "TicketTier_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTier" ADD CONSTRAINT "TicketTier_previousTierId_fkey" FOREIGN KEY ("previousTierId") REFERENCES "TicketTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketHold" ADD CONSTRAINT "TicketHold_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "TicketTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketHold" ADD CONSTRAINT "TicketHold_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "TicketTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "TicketTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityTag" ADD CONSTRAINT "EntityTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityTag" ADD CONSTRAINT "EntityTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorBrandProfile" ADD CONSTRAINT "SponsorBrandProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedAsset" ADD CONSTRAINT "GeneratedAsset_sponsorBrandId_fkey" FOREIGN KEY ("sponsorBrandId") REFERENCES "SponsorBrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedAsset" ADD CONSTRAINT "GeneratedAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- XOR scope constraints (raw SQL — not expressible in the Prisma schema).
-- TicketTier / PromoCode: exactly one of eventId / seriesId is set.
-- Order: at least one of eventId / seriesId is set.
ALTER TABLE "TicketTier" ADD CONSTRAINT "tier_scope_xor"
  CHECK (("eventId" IS NULL) <> ("seriesId" IS NULL));
ALTER TABLE "PromoCode" ADD CONSTRAINT "promo_scope_xor"
  CHECK (("eventId" IS NULL) <> ("seriesId" IS NULL));
ALTER TABLE "Order" ADD CONSTRAINT "order_scope_xor"
  CHECK (("eventId" IS NOT NULL) OR ("seriesId" IS NOT NULL));
