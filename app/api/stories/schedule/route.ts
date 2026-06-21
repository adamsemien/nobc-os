/**
 * POST /api/stories/schedule
 *
 * Schedule generated Instagram stories for publishing to an Instagram Business account.
 *
 * Request body:
 * {
 *   storyIds: string[];       // InstagramStory IDs to publish
 *   startDate?: DateTime;     // First publish date (defaults to now)
 *   publishInterval?: number; // Days between posts (default 1)
 *   batchName?: string;       // Optional batch name for tracking
 *   eventId?: string;         // Optional event association
 * }
 *
 * Response:
 * {
 *   batchId: string;
 *   storyIds: string[];
 *   status: "QUEUED";
 *   startDate: DateTime;
 *   publishInterval: number;
 * }
 *
 * This endpoint does NOT immediately publish to Instagram. Instead, it:
 * 1. Validates that all stories exist and belong to this workspace
 * 2. Creates an InstagramStoryBatch record
 * 3. Marks each story as QUEUED with a scheduledAt timestamp
 * 4. (Optional) Enqueues a background job / cron handler to publish via Instagram Graph API
 *
 * The actual publication (calling Instagram Graph API /me/media to create the post)
 * should be handled by a separate cron job (e.g., /api/cron/publish-stories) running
 * periodically to check for queued stories with scheduledAt <= now() and call the
 * Instagram endpoint.
 *
 * RBAC: STAFF only (operator scheduling).
 * Requires INSTAGRAM_BUSINESS_ACCOUNT_ID and INSTAGRAM_ACCESS_TOKEN in .env.
 */

import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface ScheduleStoriesRequest {
  storyIds: string[];
  startDate?: string; // ISO string
  publishInterval?: number; // days
  batchName?: string;
  eventId?: string | null;
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  let body: ScheduleStoriesRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    storyIds,
    startDate: startDateStr,
    publishInterval = 1,
    batchName,
    eventId,
  } = body;

  if (!Array.isArray(storyIds) || storyIds.length === 0) {
    return NextResponse.json(
      { error: 'storyIds must be a non-empty array' },
      { status: 400 }
    );
  }

  if (publishInterval <= 0) {
    return NextResponse.json(
      { error: 'publishInterval must be > 0' },
      { status: 400 }
    );
  }

  // Validate that all stories exist and belong to this workspace
  const stories = await db.instagramStory.findMany({
    where: {
      id: { in: storyIds },
      workspaceId,
    },
  });

  if (stories.length !== storyIds.length) {
    return NextResponse.json(
      {
        error: `Some stories not found or do not belong to this workspace. Expected ${storyIds.length}, found ${stories.length}`,
      },
      { status: 404 }
    );
  }

  // Parse start date or use now
  let startDate: Date = new Date();
  if (startDateStr) {
    const parsed = new Date(startDateStr);
    if (!Number.isFinite(parsed.getTime())) {
      return NextResponse.json(
        { error: 'startDate must be a valid ISO date string' },
        { status: 400 }
      );
    }
    startDate = parsed;
  }

  // Ensure startDate is not in the past (unless it's already very close to now)
  const now = new Date();
  if (startDate < now && (now.getTime() - startDate.getTime()) > 60000) {
    return NextResponse.json(
      { error: 'startDate cannot be in the past' },
      { status: 400 }
    );
  }

  // Create batch record
  const batch = await db.instagramStoryBatch.create({
    data: {
      workspaceId,
      name: batchName ?? `Batch ${new Date().toISOString().slice(0, 10)}`,
      eventId: eventId ?? null,
      startDate,
      publishInterval,
      storyIds,
      createdBy: userId,
    },
  });

  // Update stories: mark as QUEUED and set scheduledAt timestamps
  // Space them out by publishInterval days
  const updatePromises = storyIds.map((storyId, index) => {
    const scheduledDate = new Date(startDate);
    scheduledDate.setDate(scheduledDate.getDate() + index * publishInterval);
    return db.instagramStory.update({
      where: { id: storyId },
      data: {
        status: 'QUEUED',
        scheduledAt: scheduledDate,
      },
    });
  });

  await Promise.all(updatePromises);

  return NextResponse.json({
    batchId: batch.id,
    storyIds: batch.storyIds,
    status: 'QUEUED',
    startDate: batch.startDate,
    publishInterval: batch.publishInterval,
    batchName: batch.name,
  });
}

/**
 * Cron/background job handler to publish queued stories.
 *
 * This could be called via:
 * - GET /api/cron/stories/publish (Vercel Cron)
 * - A separate queueing system (Bull, Temporal, etc.)
 * - Manual trigger from the UI
 *
 * Pseudocode:
 * 1. Find all InstagramStory records with status=QUEUED and scheduledAt <= now()
 * 2. For each story:
 *    a. Call Instagram Graph API /me/media to create the post (container)
 *    b. Update the story: status=PUBLISHED, instagramMediaId=..., publishedAt=now()
 * 3. Report stats (published count, failures, retry queue)
 *
 * Not implemented in this endpoint; documented for reference.
 */
