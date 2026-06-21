# Instagram Stories Automation — Setup & Usage Guide

## ✅ What's Built & Ready

**Commit:** `feat: Instagram Story Automation`

All code is implemented, tested, built, and committed to `main`. The feature is **production-ready**.

### Components

1. **API Endpoints** (`/api/stories/*`)
   - `POST /api/stories/generate` — Generate 1080x1920 PNG stories from DAM assets
   - `POST /api/stories/schedule` — Queue stories for Instagram publishing

2. **Libraries**
   - `lib/stories/generate.ts` — Sharp-based story composition
   - `lib/stories/instagram-api.ts` — Instagram Graph API client

3. **Database**
   - `InstagramStory` model — Track generated stories
   - `InstagramStoryBatch` model — Group stories into campaigns

4. **UI**
   - `/operator/stories` — Story generation page
   - `/operator/media/_components/StoryGeneratorPanel` — Modal integration

---

## 🔧 Environment Setup

### 1. Add Environment Variables to Vercel

Go to **Vercel Project Settings → Environment Variables** and add:

```
INSTAGRAM_BUSINESS_ACCOUNT_ID=<your_business_account_id>
INSTAGRAM_ACCESS_TOKEN=<your_access_token>
```

**How to get these:**

- Go to [Meta Developers](https://developers.facebook.com/)
- Create an app with Instagram Graph API
- Generate a business account access token
- Get your business account ID from your Instagram account settings

### 2. Local Development

Your `.env.local` already has a placeholder. Update it:

```bash
# .env.local
INSTAGRAM_BUSINESS_ACCOUNT_ID=123456789
INSTAGRAM_ACCESS_TOKEN=IGBusiness|abc...xyz
```

---

## 🚀 Quick Start (Local Testing)

### 1. Ensure Database is Synced

The migration has been applied. Verify:

```bash
cd ~/code/nobc-os
npx prisma db push # Should show "database is in sync"
```

### 2. Start Dev Server

```bash
npm run dev
# Runs on http://localhost:3000
```

### 3. Upload Assets to DAM

1. Go to `http://localhost:3000/operator/media`
2. Upload 5 portrait-oriented images (phone screenshots work great)
3. Note the asset IDs

### 4. Generate Stories

**Option A: Via UI** (Easiest)

1. Go to `http://localhost:3000/operator/stories`
2. Select 5 assets from the grid
3. Enter event name: e.g., "Summer Soirée"
4. Enter day count: 1
5. Click **Generate Stories**
6. Download the generated PNG stories (1080×1920)

**Option B: Via cURL** (API Test)

```bash
curl -X POST http://localhost:3000/api/stories/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_clerk_token>" \
  -d '{
    "assetIds": ["asset1", "asset2", "asset3"],
    "eventName": "Summer Soirée",
    "dayCount": 1,
    "position": "bottom"
  }'
```

Response:

```json
{
  "stories": [
    {
      "storyId": "uuid",
      "storyUrl": "https://r2.cloudflarestorage.com/...",
      "assetId": "asset1"
    }
  ]
}
```

---

## 📅 Scheduling Stories for Automatic Publishing

### 1. Schedule a Batch

Generate stories, then schedule them for Instagram publication:

```bash
curl -X POST http://localhost:3000/api/stories/schedule \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_clerk_token>" \
  -d '{
    "storyIds": ["story1", "story2", "story3"],
    "startDate": "2026-06-21T09:00:00Z",
    "publishInterval": 1,
    "batchName": "Summer Soirée Campaign"
  }'
```

Response:

```json
{
  "batchId": "batch_123",
  "storyIds": ["story1", "story2", "story3"],
  "status": "QUEUED",
  "startDate": "2026-06-21T09:00:00Z",
  "publishInterval": 1
}
```

### 2. Auto-Publishing via Cron (Optional)

To automatically publish queued stories to Instagram at scheduled times:

1. Create `/api/cron/publish-stories` endpoint (separate task)
2. Wire it to a cron scheduler (e.g., Vercel Crons, Railway)
3. The endpoint will:
   - Find stories with `scheduledAt <= now()` and `status = QUEUED`
   - Call Instagram Graph API to publish
   - Update `publishedAt` + set `status = PUBLISHED`

**Note:** This requires Instagram business account setup. For now, you can publish manually via the Operator UI.

---

## 🎨 Story Generation Details

### Overlay Positioning

Control where the text appears with the `position` parameter:

- **`top`** — Event name at top, day counter below
- **`center`** — Both centered vertically
- **`bottom`** — Both at bottom (default, best for action content)

### Branding

Stories automatically include:

- **Event name** (NoBC red #FF4520, bold)
- **Day counter** (white, smaller font)
- **Background** — Source image scaled/cropped to 1080×1920
- **Shadow effect** — Drop shadow for text legibility

### File Format

- **Resolution:** 1080 × 1920 pixels (Instagram Story standard)
- **Format:** PNG (compressed, ~100-300KB per story)
- **Storage:** Cloudflare R2 (private, 24-hour signed URLs)

---

## 📱 Workflow for Events

### Before Event

1. Take 5 behind-the-scenes photos during setup (unbox, arrange, light test, etc.)
2. Upload to `/operator/media` DAM
3. Generate stories with day counter (e.g., "Day 3: The Grind")

### During Event

4. Post stories manually to Instagram Stories, or let the cron scheduler auto-post

### After Event

5. Archive batch for future reference

---

## 🔐 Permissions

- **STAFF role required** to access generation & scheduling endpoints
- **READ_ONLY** can view generated stories
- **ADMIN** can manage Instagram credentials

---

## 🐛 Troubleshooting

### "InstagramStory not found in workspace"

- Make sure you generated the story first (it creates the DB record)
- Verify workspace ID matches your Clerk org

### "Could not sign URL for asset"

- Check that R2 credentials are set (`R2_*` env vars)
- Verify asset exists in DAM and belongs to your workspace

### "Instagram API error: 400"

- Check that `INSTAGRAM_BUSINESS_ACCOUNT_ID` and `INSTAGRAM_ACCESS_TOKEN` are valid
- Token may have expired; regenerate from Meta Developers dashboard

### Stories not publishing automatically

- Cron job is optional and not yet deployed
- For now, download stories from UI and post manually to Instagram Stories
- Or call `/api/stories/schedule` manually to track them in the database

---

## 📊 Database Schema

### `InstagramStory`

```typescript
id: string                 // Unique ID
workspaceId: string        // Your workspace
eventId?: string           // Associated event (optional)
sourceAssetId?: string     // Original DAM asset
status: StoryStatus        // DRAFT | QUEUED | PUBLISHED | FAILED | CANCELLED
title?: string             // Event name
dayCounter?: number        // 1, 2, 3, etc.
storyImageUrl?: string     // R2 signed URL
storyR2Key?: string        // R2 object key
instagramMediaId?: string  // Instagram post ID (after publishing)
scheduledAt?: DateTime     // Scheduled publish time
publishedAt?: DateTime     // Actual publish time
createdBy: string          // Clerk user ID
createdAt: DateTime
updatedAt: DateTime
lastError?: string         // Error message if failed
attemptCount: number       // Retry counter
```

### `InstagramStoryBatch`

```typescript
id: string                 // Batch ID
workspaceId: string
name: string               // Batch name (e.g., "Summer Soirée 2026")
eventId?: string
startDate: DateTime        // First publish date
publishInterval: number    // Days between posts (default: 1)
storyIds: string[]         // Story IDs in batch
createdBy: string          // Clerk user ID
createdAt: DateTime
updatedAt: DateTime
```

---

## 📝 Next Steps

1. **Test generation locally** with sample DAM assets
2. **Set Instagram credentials** in Vercel env vars
3. **Run one event cycle** (capture → generate → download → post)
4. **Deploy to production** (existing PRs are ready)
5. **Optional:** Set up cron job for auto-publishing

---

## 📞 API Reference

### POST /api/stories/generate

Generate Instagram Stories from DAM assets.

**Request:**

```json
{
  "assetIds": ["asset1", "asset2"],
  "eventName": "Summer Soirée",
  "dayCount": 1,
  "position": "bottom"
}
```

**Response:**

```json
{
  "stories": [
    {
      "storyId": "cuid_123",
      "storyUrl": "https://r2.cloudflarestorage.com/...",
      "assetId": "asset1"
    }
  ]
}
```

---

### POST /api/stories/schedule

Queue stories for Instagram publishing.

**Request:**

```json
{
  "storyIds": ["story1", "story2"],
  "startDate": "2026-06-21T09:00:00Z",
  "publishInterval": 1,
  "batchName": "Campaign",
  "eventId": "event_123"
}
```

**Response:**

```json
{
  "batchId": "batch_123",
  "storyIds": ["story1", "story2"],
  "status": "QUEUED",
  "startDate": "2026-06-21T09:00:00Z",
  "publishInterval": 1
}
```

---

**Ready to ship!** 🎉
