'use server';

import { auth } from '@clerk/nextjs/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

// Autosave target for the application-quiz review tool. One JSON document,
// keyed "main" — created on first save, overwritten on every save after.
export async function saveApplicationReview(data: unknown) {
  const { userId } = await auth();
  if (!userId) return { ok: false as const, status: 401, error: 'Unauthorized' };
  if (!Array.isArray(data)) return { ok: false as const, status: 400, error: 'Bad payload' };
  try {
    await db.applicationReviewState.upsert({
      where: { key: 'main' },
      create: { key: 'main', data: data as Prisma.InputJsonValue },
      update: { data: data as Prisma.InputJsonValue },
    });
    return { ok: true as const };
  } catch (err) {
    console.error('[application-review] save failed', err);
    return { ok: false as const, status: 500, error: 'Save failed' };
  }
}
