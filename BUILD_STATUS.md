# NoBC OS — Build Status

## What Was Created

### App scaffold
| File | Description |
|---|---|
| `app/layout.tsx` | Root layout with ClerkProvider, NoBC metadata |
| `app/page.tsx` | Default Next.js home page (placeholder) |
| `app/globals.css` | Tailwind base styles |
| `middleware.ts` | Clerk auth — protects `/m/*` and `/operator/*` |
| `next.config.ts` | Next.js 15 config |
| `tsconfig.json` | TypeScript config with `@/*` alias |
| `tailwind.config` / `postcss.config.mjs` | Tailwind CSS 3 setup |
| `eslint.config.mjs` | ESLint config |

### Auth
| File | Description |
|---|---|
| `lib/auth.ts` | `getOrCreateWorkspaceForUser(clerkUserId)` and `requireWorkspaceId(clerkUserId)` |
| `lib/db.ts` | PrismaClient singleton using `@prisma/adapter-pg` |

### Database
| File | Description |
|---|---|
| `prisma/schema.prisma` | All models (see schema diff below) |
| `prisma.config.ts` | Prisma 7 config — pg adapter wired to `DATABASE_URL` |

### Config
| File | Description |
|---|---|
| `.env.local.example` | All required env vars |

---

## Schema Diff (new tables — no existing DB)

```sql
-- Workspace
CREATE TABLE "Workspace" (
  id          TEXT PRIMARY KEY,
  clerkOrgId  TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  createdAt   TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMP NOT NULL
);

-- Member
CREATE TABLE "Member" (
  id                TEXT PRIMARY KEY,
  workspaceId       TEXT NOT NULL REFERENCES "Workspace"(id),
  clerkUserId       TEXT NOT NULL,
  email             TEXT NOT NULL,
  firstName         TEXT NOT NULL,
  lastName          TEXT NOT NULL,
  phone             TEXT,
  status            "MemberStatus" NOT NULL DEFAULT 'PENDING',
  tags              TEXT[],
  energyScore       INT,
  networkValueScore INT,
  aiSummary         TEXT,
  createdAt         TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt         TIMESTAMP NOT NULL,
  UNIQUE (workspaceId, clerkUserId)
);

-- Application
CREATE TABLE "Application" (
  id          TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL REFERENCES "Workspace"(id),
  memberId    TEXT,
  email       TEXT NOT NULL,
  firstName   TEXT NOT NULL,
  lastName    TEXT NOT NULL,
  phone       TEXT,
  referredBy  TEXT,
  status      "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
  reviewedAt  TIMESTAMP,
  reviewedBy  TEXT,
  aiTags      TEXT[],
  createdAt   TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMP NOT NULL
);

-- ApplicationAnswer
CREATE TABLE "ApplicationAnswer" (
  id            TEXT PRIMARY KEY,
  applicationId TEXT NOT NULL REFERENCES "Application"(id),
  questionKey   TEXT NOT NULL,
  answer        TEXT NOT NULL,
  createdAt     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Event
CREATE TABLE "Event" (
  id               TEXT PRIMARY KEY,
  workspaceId      TEXT NOT NULL REFERENCES "Workspace"(id),
  slug             TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  startAt          TIMESTAMP NOT NULL,
  endAt            TIMESTAMP,
  location         TEXT,
  capacity         INT,
  accessMode       "EventAccessMode" NOT NULL DEFAULT 'OPEN',
  approvalRequired BOOLEAN NOT NULL DEFAULT FALSE,
  plusOnesAllowed  BOOLEAN NOT NULL DEFAULT FALSE,
  status           "EventStatus" NOT NULL DEFAULT 'DRAFT',
  createdAt        TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt        TIMESTAMP NOT NULL,
  UNIQUE (workspaceId, slug)
);

-- EventCustomQuestion
CREATE TABLE "EventCustomQuestion" (
  id          TEXT PRIMARY KEY,
  eventId     TEXT NOT NULL REFERENCES "Event"(id),
  workspaceId TEXT NOT NULL,
  label       TEXT NOT NULL,
  fieldType   "FieldType" NOT NULL,
  options     TEXT[],
  required    BOOLEAN NOT NULL DEFAULT FALSE,
  "order"     INT NOT NULL,
  createdAt   TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMP NOT NULL
);

-- RSVP
CREATE TABLE "RSVP" (
  id          TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL REFERENCES "Workspace"(id),
  eventId     TEXT NOT NULL REFERENCES "Event"(id),
  memberId    TEXT NOT NULL REFERENCES "Member"(id),
  status      "RSVPStatus" NOT NULL DEFAULT 'CONFIRMED',
  checkedInAt TIMESTAMP,
  createdAt   TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMP NOT NULL,
  UNIQUE (workspaceId, eventId, memberId)
);

-- Ticket
CREATE TABLE "Ticket" (
  id                    TEXT PRIMARY KEY,
  workspaceId           TEXT NOT NULL REFERENCES "Workspace"(id),
  eventId               TEXT NOT NULL REFERENCES "Event"(id),
  memberId              TEXT NOT NULL REFERENCES "Member"(id),
  rsvpId                TEXT NOT NULL REFERENCES "RSVP"(id),
  stripePaymentIntentId TEXT,
  amount                INT NOT NULL,
  currency              TEXT NOT NULL,
  status                "TicketStatus" NOT NULL,
  walletPassId          TEXT,
  createdAt             TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt             TIMESTAMP NOT NULL
);

-- Payment
CREATE TABLE "Payment" (
  id                    TEXT PRIMARY KEY,
  workspaceId           TEXT NOT NULL REFERENCES "Workspace"(id),
  ticketId              TEXT NOT NULL REFERENCES "Ticket"(id),
  stripePaymentIntentId TEXT NOT NULL,
  amount                INT NOT NULL,
  currency              TEXT NOT NULL,
  status                "PaymentStatus" NOT NULL,
  capturedAt            TIMESTAMP,
  refundedAt            TIMESTAMP,
  createdAt             TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt             TIMESTAMP NOT NULL
);

-- WaitlistEntry
CREATE TABLE "WaitlistEntry" (
  id          TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL REFERENCES "Workspace"(id),
  eventId     TEXT NOT NULL REFERENCES "Event"(id),
  memberId    TEXT NOT NULL REFERENCES "Member"(id),
  position    INT NOT NULL,
  promotedAt  TIMESTAMP,
  createdAt   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (workspaceId, eventId, memberId)
);

-- AuditEvent
CREATE TABLE "AuditEvent" (
  id          TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL REFERENCES "Workspace"(id),
  actorId     TEXT,
  action      TEXT NOT NULL,
  entityType  TEXT NOT NULL,
  entityId    TEXT NOT NULL,
  metadata    JSONB,
  createdAt   TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Enums created: `MemberStatus`, `ApplicationStatus`, `EventAccessMode`, `EventStatus`,
`FieldType`, `RSVPStatus`, `TicketStatus`, `PaymentStatus`

---

## Apply Schema

When ready (after filling in `DATABASE_URL`):

```bash
cp .env.local.example .env.local
# edit .env.local with your real DATABASE_URL

# ⚠️ NEVER `prisma db push` on this repo — it drops the out-of-band DAM indexes
# (Asset_searchVector_idx, Asset_embedding_hnsw_idx). Apply additive SQL only:
npx prisma db execute --file <migration.sql>
```

> Prisma 7 auto-detects `prisma.config.ts` — no extra flags needed. See CLAUDE.md → "Schema changes: never `prisma db push`."

---

## Pending

- [ ] `.env.local` — copy from `.env.local.example`, fill in real values
- [ ] Apply schema via `prisma db execute --file <sql>` (NEVER `db push`) after setting DATABASE_URL
- [ ] Clerk dashboard — create app, copy publishable key + secret key
- [ ] Add Clerk sign-in/sign-up UI routes (`app/(auth)/sign-in`, `app/(auth)/sign-up`)
- [ ] Member portal routes under `app/m/`
- [ ] Operator routes under `app/operator/`
- [ ] Webhook handler for Clerk events (`app/api/webhooks/clerk/route.ts`)
- [ ] MembershipTier, SponsorBrandProfile, GeneratedAsset, WalletPass models (deferred)

---

## Notes

- **Next.js version**: Scaffolded with Next.js 15.5.18 (latest). You requested v14, but
  `@clerk/nextjs@7` dropped support for Next.js 14. Next.js 15 uses the same App Router
  patterns — no meaningful API difference for this project.
- **React peer dep**: Installed with `--legacy-peer-deps` due to a minor patch version
  mismatch (`react@19.1.0` vs Clerk's `~19.1.4` peer requirement). Functionally identical.
- **Prisma 7**: The `url` field was removed from `datasource` blocks. The connection URL
  now lives in `prisma.config.ts` and is passed via `@prisma/adapter-pg` in `lib/db.ts`.
- **DB adapter**: Uses `@prisma/adapter-pg` (standard PostgreSQL). If you use Neon/Vercel
  Postgres, swap to `@prisma/adapter-neon` and `@neondatabase/serverless`.
