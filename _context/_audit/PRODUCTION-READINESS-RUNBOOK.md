# NoBC OS — Production Readiness Runbook
## Target: Real paid event, June 20th

> Authored 2026-06-12 (tonone:relay). Companion to the live Vercel inspection:
> the Vercel prod/preview *structure* already exists (`main` → Production,
> branches → Preview; `app.thenobadcompany.com` wired). What the integration
> CANNOT read is env-var *values* — so **Phase 0 (Case A vs Case B) is a
> dashboard check only Adam can do.** That check gates everything below.

---

## 1. Target Architecture

### Environment Matrix

| Dimension | Staging | Production |
|---|---|---|
| **Vercel environment** | `Preview` (auto-deploy) | `Production` |
| **Git branch** | `main` (preview URLs) or a dedicated `staging` branch | `main` (on merge) |
| **Neon DB** | Existing dev DB (`ep-twilight-forest-…` or clone) | Fresh clean DB (Case B) or existing prod DB verified clean (Case A) |
| **Clerk instance** | `allowed-zebra-34` (dev) | `app.thenobadcompany.com` (prod) |
| **Stripe keys** | Test mode (`sk_test_…` / `pk_test_…`) | Live mode (`sk_live_…` / `pk_live_…`) |
| **Resend** | Same Resend account, same `from` | Same Resend account, same `from` |
| **`NEXT_PUBLIC_APP_URL`** | `https://staging.thenobadcompany.com` or preview URL | `https://app.thenobadcompany.com` |
| **Data policy** | Demo data OK, seed scripts allowed | **ZERO seed data — real members only** |

### Full Env-Var List Per Environment

```
# ── BOTH ENVIRONMENTS ──────────────────────────────────────────────
ANTHROPIC_API_KEY=               # same key both envs (model calls)
RESEND_API_KEY=                  # same Resend key; from: is locked
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=            # if Clerk webhooks configured

# ── STAGING (Preview in Vercel) ────────────────────────────────────
DATABASE_URL=                    # Neon dev branch or existing dev DB pooled URL
NEXT_PUBLIC_APP_URL=             # staging URL
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=  # pk_test_… (allowed-zebra-34)
CLERK_SECRET_KEY=                # sk_test_… (allowed-zebra-34)
STRIPE_SECRET_KEY=               # sk_test_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY= # pk_test_…
STRIPE_WEBHOOK_SECRET=           # whsec_… (Stripe test webhook)

# Optional — staging copies of operational vars
CHECKIN_SECRET=                  # any stable string, not prod value
PASSNINJA_API_KEY=               # test or unset
SVIX_API_KEY=                    # test or unset
TWILIO_ACCOUNT_SID=              # unset unless testing House Phone
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
HOUSE_PHONE_WORKSPACE_ID=
APPLY_DEFAULT_WORKSPACE_ID=      # dev workspace ID

# ── PRODUCTION (Production in Vercel) ─────────────────────────────
DATABASE_URL=                    # Neon PROD pooled URL (clean DB)
NEXT_PUBLIC_APP_URL=             # https://app.thenobadcompany.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=  # pk_live_… (prod Clerk instance)
CLERK_SECRET_KEY=                # sk_live_… (prod Clerk instance)
STRIPE_SECRET_KEY=               # sk_live_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY= # pk_live_…
STRIPE_WEBHOOK_SECRET=           # whsec_… (Stripe live webhook, new endpoint)
CHECKIN_SECRET=                  # cryptographically random, ≥32 chars, stored in 1Password
PASSNINJA_API_KEY=               # set if going live with wallet passes
PASSNINJA_ACCOUNT_ID=
PASSNINJA_PASS_TYPE=             # nobc.member
SVIX_API_KEY=                    # set when outbound webhooks go live
APPLY_DEFAULT_WORKSPACE_ID=      # prod workspace ID (set after tenant created)
PRODUCER_WEBHOOK_URL=            # prod endpoint if Producer integration live
PRODUCER_WEBHOOK_SECRET=         # HMAC secret, prod value
```

---

## 2. Setup Runbook

### Phase 0 — Confirm current state (before touching anything)

**[Neon dashboard] + [Vercel dashboard] — founder runs**

```
Step 0.1 — Identify Neon databases
  In Neon dashboard: note all database names and their connection strings.
  Question: does the current Vercel Production DATABASE_URL point at the
  same database as your dev environment?

  → If YES: you are in Case B (shared seeded DB). Proceed to Phase 1B.
  → If NO (separate DB, unknown if clean): proceed to Phase 1A.

Step 0.2 — Row-count audit on whichever DB Vercel Production points at
  Connect via Neon SQL editor or psql with the prod DATABASE_URL.
  Run these counts:

    SELECT COUNT(*) FROM "Member";
    SELECT COUNT(*) FROM "Event";
    SELECT COUNT(*) FROM "Workspace";
    SELECT email FROM "Member" ORDER BY "createdAt" LIMIT 10;

  If you see "Gravity Ledger" company names, DAM test assets, or
  obviously fake member emails → Case B (dirty DB, must replace).
  If you see only real data or 0 rows → Case A.
```

---

### Phase 1A — Case A: Prod DB is already clean and separate

**[Vercel dashboard]**

```
Step A.1 — Confirm Vercel Production env vars point at the clean Neon DB.
  Settings → Environment Variables → filter by "Production".
  Verify DATABASE_URL host does NOT match staging/dev DB host.

Step A.2 — Verify Stripe live keys are set in Production environment.
  STRIPE_SECRET_KEY should start with sk_live_
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY should start with pk_live_

Step A.3 — Verify Clerk prod keys.
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = key from app.thenobadcompany.com instance.
  CLERK_SECRET_KEY = secret from same instance.
```

**[DB window — founder runs]** — additive migration check

```
Step A.4 — Confirm prod schema is current.
  Connect to prod DB. Run:
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;

  Compare to prisma/schema.prisma models. If any table is missing,
  proceed to Step A.5. If fully in sync, skip to Phase 2.

Step A.5 — Apply any missing migrations (additive only).
  On your local machine, with DATABASE_URL pointed at PROD:

  node node_modules/prisma/build/index.js migrate diff \
    --from-schema-datasource prisma/schema.prisma \
    --to-schema-datamodel prisma/schema.prisma \
    --script > pending.sql

  REVIEW pending.sql MANUALLY. Refuse to proceed if it contains:
    - DROP TABLE
    - DROP COLUMN
    - ALTER TYPE
    - RENAME
    - DELETE
    - TRUNCATE

  If it is additive CREATE TABLE / ADD COLUMN only:
  node node_modules/prisma/build/index.js db execute \
    --file pending.sql \
    --url "$PROD_DATABASE_URL"

  Verify: re-run the table list query. All expected tables present.
```

Skip to Phase 2.

---

### Phase 1B — Case B: Prod shares seeded dev DB (full replacement)

**[Neon dashboard]**

```
Step B.1 — Create a new Neon project or new database.
  Recommended: new PROJECT (gives you a separate compute + connection string
  that is obviously distinct from dev, no risk of mixing up URLs).
  Name it: nobc-production
  Region: match your existing DB region (check dev DB region first).
  Note the connection string (pooled) — this becomes PROD DATABASE_URL.

Step B.2 — Do NOT branch from the dev database.
  You want ZERO data. Create a blank project from scratch.
  The schema comes from migrations, not from a branch.
```

**[DB window — founder runs]**

```
Step B.3 — Apply the full schema to the blank prod DB.
  Set a local env var pointing at the NEW prod DB:
    export PROD_DATABASE_URL="postgresql://..."  # new Neon project URL

  Generate the migration SQL from scratch:
  node node_modules/prisma/build/index.js migrate diff \
    --from-empty \
    --to-schema-datamodel prisma/schema.prisma \
    --script > initial-prod-schema.sql

  REVIEW initial-prod-schema.sql — it should be entirely CREATE TABLE,
  CREATE INDEX, no DROPs. If anything looks wrong, stop and ask.

  Apply:
  node node_modules/prisma/build/index.js db execute \
    --file initial-prod-schema.sql \
    --url "$PROD_DATABASE_URL"

Step B.4 — Apply the GIN index manually (CRITICAL — do not skip).
  The Asset_searchVector_idx index is NOT in schema.prisma.
  Run the contents of prisma/sql/dam-search-vector.sql against prod:

  node node_modules/prisma/build/index.js db execute \
    --file prisma/sql/dam-search-vector.sql \
    --url "$PROD_DATABASE_URL"

Step B.5 — Verify schema is complete.
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name;

  -- Spot-check GIN index exists:
  SELECT indexname FROM pg_indexes
  WHERE indexname = 'Asset_searchVector_idx';

  -- Verify zero rows:
  SELECT COUNT(*) FROM "Member";    -- expect 0
  SELECT COUNT(*) FROM "Event";     -- expect 0
  SELECT COUNT(*) FROM "Workspace"; -- expect 0
```

**[Vercel dashboard]**

```
Step B.6 — Cut prod env vars to the new DB.
  Settings → Environment Variables.
  Update DATABASE_URL (Production environment only) to the new Neon URL.
  Do NOT touch Preview/Development environment DATABASE_URL.

Step B.7 — Trigger a fresh deployment.
  Deployments → Redeploy latest Production deployment.
  This ensures the new DATABASE_URL is picked up.
```

**[Clerk dashboard]** — prod Clerk instance

```
Step B.8 — Create the founder's org (workspace/tenant) in prod Clerk.
  In app.thenobadcompany.com Clerk instance:
  Organizations → Create organization → name: No Bad Company (or tenant name).
  Note the Clerk org ID — this becomes your workspaceId seed.

Step B.9 — Create the Workspace row in prod DB.
  The Workspace row must exist before any Clerk org member can resolve a workspace.
  Connect to prod DB and run (column names must match schema.prisma — verify first):

  INSERT INTO "Workspace" ("id", "name", "clerkOrgId", "slug", "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid(),
    'No Bad Company',
    '<clerk-org-id-from-step-B8>',
    'nobc',
    NOW(),
    NOW()
  );

  SELECT id FROM "Workspace" WHERE "clerkOrgId" = '<clerk-org-id>';
  -- Note this workspace ID — set it as APPLY_DEFAULT_WORKSPACE_ID.
```

**[Vercel dashboard]**

```
Step B.10 — Set APPLY_DEFAULT_WORKSPACE_ID in prod env vars.
  Value = the workspace UUID from Step B.9.
```

---

### Phase 2 — Staging environment formalization

**[Vercel dashboard]**

```
Step 2.1 — Confirm Preview environment has its own env vars.
  DATABASE_URL (Preview) → dev Neon DB (seeded, that's fine for staging).
  STRIPE_SECRET_KEY (Preview) → sk_test_… (Stripe test mode).
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (Preview) → allowed-zebra-34 dev instance.
  NEXT_PUBLIC_APP_URL (Preview) → staging URL or leave as Vercel preview URL.

Step 2.2 — Add a NEXT_PUBLIC_ENVIRONMENT variable (optional but useful).
  Set NEXT_PUBLIC_ENVIRONMENT=staging in Preview.
  Set NEXT_PUBLIC_ENVIRONMENT=production in Production.
  This lets seed-guard logic (Phase 3) key off it without reading DB host.
```

**[Stripe dashboard]**

```
Step 2.3 — Confirm test webhook endpoint exists for staging.
  Stripe dashboard → Developers → Webhooks → Test mode.
  Add endpoint: https://<staging-url>/api/stripe/webhook
  Events: payment_intent.succeeded, payment_intent.payment_failed,
          charge.refunded (match whatever the app handles).
  Copy the signing secret → set as STRIPE_WEBHOOK_SECRET in Vercel Preview env.
```

---

### Phase 3 — Stripe live webhook for production

**[Stripe dashboard]**

```
Step 3.1 — Create live mode webhook endpoint.
  Switch Stripe dashboard to LIVE mode.
  Developers → Webhooks → Add endpoint.
  URL: https://app.thenobadcompany.com/api/stripe/webhook
  Same event list as test webhook.
  Copy signing secret → set as STRIPE_WEBHOOK_SECRET in Vercel Production env.

Step 3.2 — Verify STRIPE_SECRET_KEY in prod is sk_live_…
  Vercel → Production env vars → confirm prefix.
```

---

## 3. Data-Hygiene Guard

### Guard in every seed script

Add this block at the top of each file in `scripts/`:

```typescript
// PRODUCTION GUARD — must be first executable line
const DB_URL = process.env.DATABASE_URL ?? '';
const IS_PROD_DB = DB_URL.includes('nobc-production') ||  // adjust to your prod Neon project name/host
                   process.env.NEXT_PUBLIC_ENVIRONMENT === 'production';

if (IS_PROD_DB && process.env.SEED_ALLOW_PROD !== 'IKNOWWHATIMDOING') {
  console.error('BLOCKED: Seed script attempted to run against production database.');
  console.error('DATABASE_URL host:', new URL(DB_URL).hostname);
  process.exit(1);
}
```

The check is multi-layered:
1. **DB hostname** — Neon project name appears in the hostname. Your prod project (`nobc-production`) will have a different hostname than dev (`ep-twilight-forest-…`). Hard to accidentally match.
2. **NEXT_PUBLIC_ENVIRONMENT** env var — staging=false, production=exit.
3. **SEED_ALLOW_PROD flag** — a seed will only run in prod if you explicitly pass `SEED_ALLOW_PROD=IKNOWWHATIMDOING` (typo-resistant). No automation should ever set this.

Scripts to patch: `seed-gravity-ledger.ts`, `seed-dam.ts`, `seed-test-open-event.ts`, `seed-test-full-event.ts`, `seed-test-apply-event.ts`, `seed-test-ticketed-event.ts`, `grandfather-members.ts`, `populate-psychographics.ts`, `backfill-member-firmographics.ts`, `seed-member-record-demo.ts`.

### Prod cleanliness verification query

Run after every deployment, before the event, on the prod DB:

```sql
-- Run in Neon SQL editor against prod DB
SELECT 'Member' as tbl, COUNT(*) as rows FROM "Member"
UNION ALL SELECT 'Event', COUNT(*) FROM "Event"
UNION ALL SELECT 'RSVP', COUNT(*) FROM "RSVP"
UNION ALL SELECT 'Workspace', COUNT(*) FROM "Workspace"
UNION ALL SELECT 'Asset', COUNT(*) FROM "Asset"
UNION ALL SELECT 'SmsConversation', COUNT(*) FROM "SmsConversation";

-- Check for obviously seeded member names
SELECT email, name FROM "Member"
WHERE name ILIKE '%gravity%'
   OR name ILIKE '%ledger%'
   OR email LIKE '%@example%'
   OR email LIKE '%@test%'
LIMIT 20;
```

Expected output for a clean prod DB: `Member=0`, `Event=0`, `RSVP=0`, `Asset=0` (until real data created). Any row with `@example` or `@test` email is a seed artifact and should not exist.

---

## 4. Pre-Event Dress Rehearsal

### 4a. Full money-path walkthrough in staging (Stripe test mode)

Run this end-to-end in the staging environment. Confirm each checkpoint before proceeding.

```
SETUP
- Staging env vars confirmed: sk_test_…, pk_test_…, dev Clerk instance, dev Neon DB.
- Open Stripe dashboard in TEST mode — watch the Events feed in real time.

STEP 1 — Event creation (operator)
  Log in as operator on staging.
  Create new event: name, date, capacity=5, mode=TICKETED, price=$20.
  Add one custom registration field (text, required).
  Set access mode to require approval (to test both paths).
  Publish event.
  - Event appears on member event calendar.

STEP 2 — Member registration + payment
  Open a private/incognito window. Sign in as a test member (dev Clerk).
  Navigate to the event detail page.
  Click "Get Ticket — $20".
  Fill the custom field. Proceed to payment.
  Use Stripe test card: 4242 4242 4242 4242 / any future exp / any CVC.
  - Payment intent created in Stripe test dashboard (authorize).
  - RSVP row created in DB with status PENDING or equivalent.
  - Confirmation email received at test member email (Resend logs).

STEP 3 — Operator approval + capture
  Back in operator dashboard, find the registration.
  Approve access. (This triggers the Stripe capture.)
  - In Stripe test dashboard: PaymentIntent status = succeeded.
  - Member receives approval/confirmation email.

STEP 4 — Access gate verification
  As test member, return to event detail.
  - CTA shows "You're on the list" (not "Get Ticket" again).
  - Member portal shows the registration.

STEP 5 — Check-in simulation
  Operator navigates to check-in PWA (offline-capable).
  Scan or manually look up test member.
  - QR scan resolves correctly (member-qr.ts path).
  - Check-in status updates.

STEP 6 — Operator refund
  In operator dashboard, navigate to the registration.
  Issue refund.
  - Stripe test dashboard shows refund created.
  - Member receives refund confirmation email.

STEP 7 — Waitlist path (optional but recommended)
  Set event capacity to 0. Attempt another registration.
  - Waitlist status correct.
  - Auto-promote fires when capacity increases.

PASS CRITERIA: All 7 steps complete without error. Stripe, email, and DB
state all consistent with expected values.
```

### 4b. Production go-live checklist

Complete every item before creating the real event in prod.

```
DATABASE
- Row-count query shows Member=0, Event=0 (or only real records from B.9 setup).
- No seeded/test member emails in Member table.
- GIN index Asset_searchVector_idx confirmed present.
- Workspace row exists with correct clerkOrgId.

INFRASTRUCTURE
- APPLY_DEFAULT_WORKSPACE_ID set in Vercel Production to prod workspace UUID.
- DATABASE_URL (Production) points at nobc-production Neon project.
- STRIPE_SECRET_KEY starts with sk_live_ in Production env.
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY starts with pk_live_ in Production env.
- STRIPE_WEBHOOK_SECRET in Production matches the live webhook signing secret.
- CLERK keys in Production are from app.thenobadcompany.com instance.
- CHECKIN_SECRET is set in Production (≥32 random chars, stored in 1Password).
- Custom domain app.thenobadcompany.com routes to Vercel Production deployment.

EMAIL
- Send a transactional email manually via Resend API (or trigger a test action
  in prod that sends email). Confirm it arrives from team@thenobadcompany.com.
- Check Resend dashboard: domain thenobadcompany.com is verified, DKIM passing.

STRIPE LIVE PAYMENT TEST
- As the founder, do a real $1 test:
    - Create a non-public or draft event in prod with price $1.
    - Register with your own real card.
    - Confirm PaymentIntent appears in Stripe LIVE dashboard.
    - Approve access (trigger capture).
    - Confirm charge succeeded (not just authorized).
    - Refund immediately.
    - Confirm refund in Stripe live dashboard.
    - Delete the $1 test event.
  This is the only way to confirm the live Stripe integration is wired correctly.

CLERK PRODUCTION
- Log in to prod via app.thenobadcompany.com — auth resolves correctly.
- Operator dashboard loads and resolves workspace.
- As a second test user: apply for membership (/apply). Application appears in
  operator dashboard.

FINAL
- Real event created in prod: correct date, capacity, price, access mode.
- Event published.
- Event URL shared internally — confirm it renders correctly.
- Operator team members added in Clerk prod org + WorkspaceMember rows created.
```

---

## 5. Event-Day Rollback / Abort Plan

### If checkout breaks (Stripe payment fails mid-event)

```
IMMEDIATE (< 2 min):
1. Operator uses "Comp" path — bypass payment entirely.
   Operator dashboard → event → issue Comp Ticket to affected member.
   This creates an RSVP without a Stripe transaction.
   Use for any member stuck at payment.

2. Do NOT roll back the deployment. A bad Stripe key or webhook mismatch
   is a config problem, not a code problem. Check Stripe dashboard →
   Developers → Webhooks → recent deliveries for error details.

3. If STRIPE_WEBHOOK_SECRET is wrong (common cause of capture failures):
   Update the env var in Vercel → Settings → Environment Variables.
   Redeploy (Vercel → Deployments → Redeploy) — takes ~90 seconds.

FALLBACK:
Manual Add-Member: Operator dashboard → Add Member slide-over →
create the member record directly. Collect payment via Square/Venmo
offline. Reconcile in Stripe later.
```

### If check-in breaks (door scanning fails)

```
IMMEDIATE:
1. Check-in uses event-scoped signed tokens (CHECKIN_SECRET).
   If CHECKIN_SECRET changed or is missing → tokens invalid → door scanner 401.
   Fix: verify CHECKIN_SECRET in Vercel Production env. If missing, set it
   and redeploy.

2. Manual fallback: operator pulls up member list in dashboard on a phone.
   Filter by event → RSVP list → visual verification.
   No QR scanner needed — name lookup is sufficient for a <50 person event.

3. Offline PWA: if the check-in PWA was loaded before network issues,
   it may continue functioning from cache. Confirm before event day that
   the PWA is loaded on the door device while online.
```

### If auth breaks (Clerk outage or misconfiguration)

```
IMMEDIATE:
1. Check Clerk status page (status.clerk.com). If Clerk is down globally,
   there is no app-level fix — communicate with guests via direct contact.

2. If auth fails only in prod (not Clerk-wide): check that the Clerk prod
   instance keys in Vercel Production match the app.thenobadcompany.com
   Clerk instance. A common cause is Preview env vars leaking to Production.

3. Operator can still access the Neon database directly via Neon SQL editor
   to look up RSVPs and manually verify at the door.
```

### Bad deploy rollback (code regression on event day)

```
Vercel instant rollback (< 90 seconds):
  Vercel dashboard → Deployments → find the last known-good deployment.
  Click the three-dot menu → Promote to Production.
  No code changes, no redeploy — Vercel swaps the live alias instantly.

Policy: do NOT merge code changes after noon on June 20th.
If a fix is genuinely required mid-event, deploy to Preview/staging first,
verify in staging, then promote — not a direct push to main.
```

### Who does what

```
Founder/operator: Vercel dashboard access + Stripe dashboard (refunds, manual
  charge lookup). Should be on a laptop, not just phone.

Door staff: check-in PWA on a dedicated device, loaded while on wifi before doors open.

If something breaks: one person handles door manually (name list in dashboard)
  while founder debugs. Split responsibilities — don't both stare at a laptop.
```

---

## 6. Two-Week Timeline

```
TODAY — June 12 (Day 0)
  - Run Step 0.1 and 0.2 — determine Case A or Case B.
  - Decision recorded. No other changes until you know which case.

June 12–13 (Days 0–1): Environment setup
  - Case A or Case B steps completed (Phase 1A or 1B).
  - Vercel Production env vars updated.
  - Stripe live webhook endpoint created.
  - Seed guard block added to all seed scripts in scripts/.
  - Fresh deployment promoted to Production.
  - Row-count query run — prod confirmed clean.

June 13–14 (Days 1–2): Staging dress rehearsal
  - Full money-path walkthrough (Section 4a) completed in staging.
  - Every checkbox passes. No skipping steps.
  - Stripe test: authorize → capture → refund all confirmed.
  - Email delivery confirmed via Resend logs.

June 14–15 (Days 2–3): Production smoke test
  - $1 live Stripe charge + refund (Section 4b, Stripe live payment test).
  - Real registration at /apply in prod — application appears in operator dashboard.
  - Custom domain confirmed, email from team@thenobadcompany.com confirmed delivered.

June 15–16 (Days 3–4): Real event created in prod
  - Event created with real date (June 20), real capacity, real price.
  - Event published.
  - Operator team members added (Clerk prod org + WorkspaceMember rows).
  - APPLY_DEFAULT_WORKSPACE_ID confirmed.

June 16–18 (Days 4–6): Soft open / internal test registrations
  - Invite 2–3 real members to register. Confirm the full flow with real Clerk prod accounts.
  - Confirm RSVP appears correctly in operator dashboard.
  - Confirm member portal shows "You're on the list".
  - Confirm Stripe live captures correctly on approval.
  - Optional: test comp path (issue a comp to a team member).

June 18 (Day 6): Pre-event freeze
  - Final row-count audit on prod.
  - Go-live checklist (Section 4b) re-run in full — sign off each checkbox.
  - Vercel rollback rehearsal: identify last-good deployment ID, confirm
    rollback procedure is understood.
  - Door device: check-in PWA loaded, tested with a known RSVP.

June 19 (Day 7, day before): Hard freeze
  - NO code merges to main after noon today.
  - Operator dashboard open on a second device — confirm it loads.
  - Stripe dashboard accessible to founder.
  - CHECKIN_SECRET confirmed set in prod.
  - Team briefed on manual fallbacks (Section 5).

June 20 (Event day)
  - 2 hours before doors: run row-count query one more time.
  - 1 hour before doors: door device online, check-in PWA loaded.
  - Doors open: one person on door, founder on laptop.
  - Post-event: mark event as past. Capture any outstanding authorized charges.
```

---

**Bottom line on risk:** The single highest-risk item is Case B (prod on seeded DB). If that's your situation, the clean-DB cutover (Phase 1B) is the most important thing you do this week — everything else is verification and rehearsal on top of a correct foundation. Do not skip the $1 live Stripe test (Section 4b). That is the only way to confirm the live payment path is wired before a real guest hits it.
