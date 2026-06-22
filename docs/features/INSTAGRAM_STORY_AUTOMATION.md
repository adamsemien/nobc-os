# Instagram Story Automation for NoBC Events

## Overview

This feature enables operators to generate and schedule Instagram Stories from DAM assets with:
- Text overlays (event name, day counter badges)
- Automatic resizing to Instagram Story format (1080×1920 PNG)
- Storage in Cloudflare R2
- Instagram Graph API integration for publishing
- Batch scheduling with configurable publish intervals

## Architecture

### Files Created

#### API Endpoints

1. **`app/api/stories/generate/route.ts`** — Generate a story
   - Takes a DAM asset ID, applies overlays
   - Stores the generated PNG in R2
   - Creates an `InstagramStory` record with status=DRAFT
   - Returns signed URL + story metadata
   - **RBAC:** STAFF only

2. **`app/api/stories/schedule/route.ts`** — Schedule stories for publishing
   - Takes array of story IDs + timeline
   - Creates `InstagramStoryBatch` record
   - Marks stories as QUEUED with scheduled timestamps
   - Spaces them out by configurable interval (default 1 day)
   - **RBAC:** STAFF only
   - **Note:** Does not call Instagram API; that's a separate cron job (documented below)

#### Libraries

3. **`lib/stories/generate.ts`** — Image generation
   - `generateStoryImage()` — Compose overlays onto base image using Sharp
   - Text overlays (event name, day counter badge)
   - Resizes/crops to 1080×1920 maintaining aspect ratio

4. **`lib/stories/instagram-api.ts`** — Instagram Graph API client
   - `getInstagramClient()` — Singleton client
   - `createStoryContainer()` — Create media container
   - `getContainerStatus()` — Poll for completion
   - `publishContainer()` — Publish to Instagram
   - `publishStoryWithRetry()` — End-to-end with polling

#### Operator UI

5. **`app/operator/media/_components/StoryGeneratorPanel.tsx`** — Modal workflow
   - Asset picker (from DAM library)
   - Event/title selector
   - Text overlay inputs (event name, day counter)
   - Live preview
   - Generate + Schedule buttons

6. **`app/operator/media/_components/useStoryGenerator.ts`** — State hook

#### Database Schema

7. **`prisma/schema.prisma`** — New models
   - `StoryStatus` enum: DRAFT, QUEUED, PUBLISHED, FAILED, CANCELLED
   - `InstagramStory` — Individual story with metadata, status, scheduling info
   - `InstagramStoryBatch` — Group of stories with shared publish timeline
   - Both models scaffold cascade deletes on workspace + indexes for efficient querying

---

## Environment Variables

Add these to `.env.local` and deploy to Vercel:

### Instagram Graph API (Required for Publishing)

```bash
# Business account ID (from Instagram Business Suite)
INSTAGRAM_BUSINESS_ACCOUNT_ID=<YOUR_ACCOUNT_ID>

# Long-lived access token (from Meta for Developers — Business login flow)
# Scopes required: instagram_business_basic, instagram_business_content_publish
INSTAGRAM_ACCESS_TOKEN=<YOUR_ACCESS_TOKEN>
```

### Existing (Already Configured)

- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_EVENT_MEDIA_BUCKET` — Cloudflare R2 storage (reused from DAM)
- `DATABASE_URL`, `DIRECT_URL` — Postgres on Neon (schema already updated)

---

## Database Migration

The Prisma schema has been updated with `InstagramStory` and `InstagramStoryBatch` models. To deploy:

1. **Local dev:**
   ```bash
   cd ~/code/nobc-os
   npx prisma generate  # Update client
   ```

2. **Production (Vercel):**
   ```bash
   # On Neon production:
   # 1. Trigger a schema migration via Vercel deploy (auto-pushes or uses migrate)
   # OR manually:
   npx prisma migrate deploy --schema prisma/schema.prisma
   ```

   **CRITICAL:** Never run `prisma db push` — it will drop the DAM GIN index. See `CLAUDE.md` for the ritual.

---

## API Workflows

### Story Generation

**Request:**
```bash
curl -X POST http://localhost:3000/api/stories/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <clerk-token>" \
  -d '{
    "assetId": "asset_123",
    "eventId": "event_456",
    "eventName": "Summer Gala 2026",
    "dayCounter": 1,
    "title": "Gala Day 1 Story"
  }'
```

**Response:**
```json
{
  "storyId": "story_789",
  "storyImageUrl": "https://r2.cloudflarestorage.com/..?signed-params",
  "r2Key": "stories/workspace_abc/story_789/story.png",
  "status": "DRAFT",
  "createdAt": "2026-06-20T10:30:00Z"
}
```

### Story Scheduling

**Request:**
```bash
curl -X POST http://localhost:3000/api/stories/schedule \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <clerk-token>" \
  -d '{
    "storyIds": ["story_1", "story_2", "story_3"],
    "startDate": "2026-06-21T10:00:00Z",
    "publishInterval": 1,
    "batchName": "Summer Gala Stories",
    "eventId": "event_456"
  }'
```

**Response:**
```json
{
  "batchId": "batch_999",
  "storyIds": ["story_1", "story_2", "story_3"],
  "status": "QUEUED",
  "startDate": "2026-06-21T10:00:00Z",
  "publishInterval": 1,
  "batchName": "Summer Gala Stories"
}
```

---

## Instagram Publishing (Cron Job — Not Yet Implemented)

The `/api/stories/schedule` endpoint marks stories as QUEUED but does NOT publish them. To publish, you need a separate cron job that:

1. Finds all stories with `status=QUEUED` and `scheduledAt <= now()`
2. For each story:
   - Fetch the story image from R2 (get the signed URL)
   - Call Instagram Graph API `/me/media` with `media_type=STORIES` + `image_url`
   - Poll the container until `status=FINISHED`
   - Call `/me/media_publish` to publish the container
   - Update the story: `status=PUBLISHED`, `instagramMediaId=...`, `publishedAt=now()`

**Suggested implementation:**

Create `app/api/cron/stories/publish/route.ts`:

```typescript
import { db } from '@/lib/db';
import { getInstagramClient } from '@/lib/stories/instagram-api';
import { presignGet } from '@/lib/dam/storage';
import { StoryStatus } from '@prisma/client';

export async function GET(req: Request) {
  // Verify cron secret header (Vercel sends x-vercel-cron-secret)
  const secret = req.headers.get('x-vercel-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const stories = await db.instagramStory.findMany({
    where: {
      status: StoryStatus.QUEUED,
      scheduledAt: { lte: now },
    },
  });

  const client = getInstagramClient();
  if (!client.isConfigured()) {
    console.warn('[cron/publish-stories] Instagram not configured, skipping');
    return new Response('Instagram not configured', { status: 503 });
  }

  let published = 0;
  let failed = 0;

  for (const story of stories) {
    try {
      // Get signed URL for the story image (valid 24 hrs)
      const storyUrl = presignGet(story.storyR2Key, 24 * 60 * 60);
      if (!storyUrl) {
        throw new Error('Could not get signed URL for story');
      }

      // Publish via Instagram API
      const mediaId = await client.publishStoryWithRetry(storyUrl, {
        caption: story.title,
        maxRetries: 10,
        delayMs: 2000,
      });

      // Update story record
      await db.instagramStory.update({
        where: { id: story.id },
        data: {
          status: StoryStatus.PUBLISHED,
          instagramMediaId: mediaId,
          publishedAt: now,
        },
      });

      published++;
    } catch (err) {
      failed++;
      await db.instagramStory.update({
        where: { id: story.id },
        data: {
          status: StoryStatus.FAILED,
          lastError: err instanceof Error ? err.message : String(err),
          attemptCount: { increment: 1 },
        },
      });
      console.error(`[cron/publish-stories] Story ${story.id} failed`, err);
    }
  }

  return new Response(
    JSON.stringify({ published, failed, total: stories.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
```

Then schedule it in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/stories/publish",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

---

## Operator UI Integration

To add the story generator button to the media library:

1. **In `app/operator/media/_components/MediaToolbar.tsx`:**

```typescript
import { StoryGeneratorPanel } from './StoryGeneratorPanel';
import { useStoryGeneratorPanel } from './useStoryGenerator';

export function MediaToolbar({ assets, events, ... }: Props) {
  const storyPanel = useStoryGeneratorPanel();

  return (
    <>
      <div className="flex gap-2">
        {/* Existing buttons... */}
        <button
          onClick={storyPanel.open}
          className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          Story
        </button>
      </div>

      <StoryGeneratorPanel
        isOpen={storyPanel.isOpen}
        onClose={storyPanel.close}
        assets={assets}
        events={events}
        onStoryGenerated={(storyId, url) => {
          // Optionally refresh the media grid, show a toast, etc.
          console.log('Story generated:', storyId);
        }}
      />
    </>
  );
}
```

2. **Button styling uses Tailwind** (existing NoBC red: `bg-red-600`)

---

## RBAC & Security

- **`POST /api/stories/generate`** — Requires `OperatorRole.STAFF` (same guard as DAM uploads)
- **`POST /api/stories/schedule`** — Requires `OperatorRole.STAFF`
- **DAM asset access** — Existing `@/lib/dam/storage.ts` gating; operators see only their workspace's assets
- **Instagram token** — Stored in Vercel secrets (environment), never logged or exposed in client
- **R2 objects** — Private; signed URLs expire (15 min display, 24 hr download)

---

## Testing Locally

1. **Generate a story:**
   ```bash
   curl -X POST http://localhost:3000/api/stories/generate \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <your-clerk-session>" \
     -d '{"assetId":"<dam-asset-id>"}'
   ```

2. **Schedule it:**
   ```bash
   curl -X POST http://localhost:3000/api/stories/schedule \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <your-clerk-session>" \
     -d '{"storyIds":["<story-id>"]}'
   ```

3. **Check the database:**
   ```bash
   npx prisma studio
   # Browse InstagramStory and InstagramStoryBatch tables
   ```

---

## Future Enhancements

- **Video stories** — Add support for MP4 input (requires Sharp + FFmpeg)
- **Template designer** — UI to customize overlay colors, fonts, positions
- **Analytics** — Track Instagram impressions + engagement (via Instagram Insights API)
- **Retry + dead-letter queue** — For failed publishes (current impl has basic retry in API client)
- **Watermark + branding** — Add workspace logo to stories automatically
- **A/B testing** — Publish variants and compare engagement

---

## Support & Debugging

**Common errors:**

| Error | Cause | Fix |
|-------|-------|-----|
| `assetId required` | No asset selected | Ensure DAM asset exists and is accessible |
| `Failed to fetch source image` | R2 not configured or key invalid | Check `R2_*` env vars and asset URL |
| `Story generation failed` | Sharp error (corrupt image, too large) | Verify image format, size < 50MB |
| `Instagram integration not configured` | Missing env vars | Add `INSTAGRAM_*` to Vercel secrets |
| `401 Unauthorized` on cron | Wrong CRON_SECRET | Verify header matches `.env.local` |

**Logs to check:**

- Vercel deployment logs: `npm run build` output
- Runtime logs: Check Vercel Functions dashboard
- Database: `SELECT * FROM "InstagramStory" ORDER BY "createdAt" DESC LIMIT 10;`

---

## PR Checklist

- [ ] Schema migration tested locally (`prisma generate`)
- [ ] Both API endpoints tested with curl/Postman
- [ ] UI component renders and form submits correctly
- [ ] RBAC guards in place (STAFF-only)
- [ ] Error handling + validation on all inputs
- [ ] Signed URLs function correctly
- [ ] Instagram client methods documented
- [ ] Env vars documented in `.env.local.example`
- [ ] No console.error spam; only meaningful logs
