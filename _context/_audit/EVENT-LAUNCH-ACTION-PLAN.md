# Event Launch — Master Action Plan (Adam)
## Target: real paid event, June 20. Compiled 2026-06-12.

> This is the human-action companion to `PRODUCTION-READINESS-RUNBOOK.md`.
> Env-var values are sources/placeholders — never paste secrets into this file.

---

## TL;DR — the whole thing in 4 moves

1. **Decide Case A vs B** — open `app.thenobadcompany.com`, look at the data. Demo/"Gravity Ledger" members → **Case B** (build a clean prod DB). Empty/real → **Case A** (just verify).
2. **Fix 2 staging gaps in Vercel Preview** — it has **no Stripe keys** and is pointed at your **prod Clerk** instance. Add test Stripe + dev Clerk so you can dress-rehearse.
3. **Verify/seal Production** — clean DB, `sk_live_` Stripe, prod Clerk, `CHECKIN_SECRET`, live Stripe webhook.
4. **Dress rehearse in staging → $1 live test in prod → create the real event.** (Runbook §4 + timeline.)

---

## Table 1 — Critical env vars (the event path). Set per-environment in Vercel.

| Variable (exact name) | Production value | Preview / Staging value | Where to get it | Live status (2026-06-12) |
|---|---|---|---|---|
| `DATABASE_URL` | Clean prod Neon **pooled** URL | Dev Neon pooled URL (`ep-twilight-forest…`) | Neon → project → Connection string (pooled) | Prod ✅ set (sealed — verify it's clean via browser). Preview ✅ = dev DB |
| `DIRECT_URL` | Clean prod Neon **unpooled** URL | Dev Neon unpooled URL | Neon → Connection string (direct/unpooled) | Needed for migrations (DB window). Can be local-only |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` (app.thenobadcompany.com) | `pk_test_…` (dev instance `allowed-zebra-34`) | Clerk → instance → API keys | ⚠️ **Preview is on `pk_live_` (prod) — CHANGE to dev** |
| `CLERK_SECRET_KEY` | `sk_live_…` (prod instance) | `sk_test_…` (dev instance) | Clerk → instance → API keys | ⚠️ Same — set Preview to dev secret |
| `STRIPE_SECRET_KEY` | `sk_live_…` | `sk_test_…` | Stripe → Developers → API keys (toggle Live/Test) | ⚠️ Prod ✅ set (sealed). **Preview MISSING — ADD test key** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` | `pk_test_…` | Stripe → API keys | ⚠️ **Preview MISSING — ADD** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (live endpoint) | `whsec_…` (test endpoint) | Stripe → Webhooks → endpoint → signing secret | ⚠️ **Preview MISSING — ADD after creating test webhook** |
| `NEXT_PUBLIC_APP_URL` | `https://app.thenobadcompany.com` | staging URL or leave as Vercel preview URL | n/a | Verify |
| `CHECKIN_SECRET` | random ≥32 chars (1Password) | any stable string | generate (`openssl rand -hex 32`) | Verify set in Prod (door scanning fails closed without it) |
| `CRON_SECRET` | random ≥32 chars | any stable string | generate (`openssl rand -hex 32`) | ⚠️ Bearer-gates `GET /api/cron/capture-payments` (nightly hold-capture backstop for events <24h out). **Cron is NOT yet scheduled in `vercel.json`** (only `event-reminders` is) — secret is inert until the cron path is added there. Capture still fires via Stripe webhook (`payment_intent.succeeded`) + operator approval, so this is a backstop, not the primary capture. |
| `APPLY_DEFAULT_WORKSPACE_ID` | prod Workspace UUID | dev Workspace UUID | DB after the workspace row exists | Set after prod workspace created |
| `RESEND_API_KEY` | same both | same both | Resend dashboard | ✅ |
| `ANTHROPIC_API_KEY` | same both | same both | Anthropic console | ✅ |

## Table 2 — Secondary / optional (not event-critical — leave as-is for the 20th)

| Variable | Note |
|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_EVENT_MEDIA_BUCKET` | DAM/media storage. Fine to share across envs for now (separate bucket later if desired) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob. Leave |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | House Phone SMS — **not** in the event path. Leave unset/prod-only |
| `HOUSE_PHONE_WORKSPACE_ID` | House Phone scoping. Leave |
| `PASSNINJA_API_KEY` / `PASSNINJA_ACCOUNT_ID` / `PASSNINJA_PASS_TYPE` | Wallet passes — optional, not needed for the event |
| `SVIX_API_KEY` | Outbound webhooks — optional |
| `PRODUCER_CRM_EXPORT_URL` / `NOBC_OS_WEBHOOK_SECRET` | CRM connector (pull FROM Producer) — not in event path; part of the CRM stream |
| `PRODUCER_WEBHOOK_URL` / `PRODUCER_WEBHOOK_SECRET` | Outbound Phase-J event webhook to Producer — optional |
| `PEXELS_API_KEY` | Stock images. Leave |
| `DEV_USER_IDS` / `NEXT_PUBLIC_DEV_USER_IDS` | Dev tooling — **Preview/Dev only, NEVER Production** |
| `NEXT_PUBLIC_ENVIRONMENT` | Optional: set `production` in Prod, `staging` in Preview — powers the seed-guard |

> **How to set per-environment in Vercel:** Project → Settings → Environment Variables → add the var, then tick **only** the target environment (Production *or* Preview). For secrets you don't want readable later, mark **Sensitive** (this is why your prod values are currently unreadable — that's correct behavior).

---

## Action plan — by where you do it

### 🌐 Browser — DO FIRST (5 min)
- [ ] Open `app.thenobadcompany.com`. Demo data → **Case B**. Empty/real → **Case A**. Tell Claude which.
- [ ] Open the sign-in page — confirm whether it shows Clerk "development mode" (dev instance) or not (prod instance).

### 🟦 Vercel — Environment Variables (this week)
- [ ] **ADD to Preview:** `STRIPE_SECRET_KEY` (`sk_test_`), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_`), `STRIPE_WEBHOOK_SECRET` (test).
- [ ] **CHANGE in Preview:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` → dev instance (`allowed-zebra-34`) test keys.
- [ ] **VERIFY in Production:** `STRIPE_SECRET_KEY` starts `sk_live_`; Clerk keys are the prod instance; `CHECKIN_SECRET` is set; `NEXT_PUBLIC_APP_URL` = `https://app.thenobadcompany.com`.
- [ ] (Case B) **UPDATE Production `DATABASE_URL` + `DIRECT_URL`** to the new clean Neon DB, then redeploy.
- [ ] **SET `APPLY_DEFAULT_WORKSPACE_ID`** (Production) once the prod workspace row exists.
- [ ] (Optional) add `NEXT_PUBLIC_ENVIRONMENT` = `production` / `staging` per env.

### 🟩 Neon (only if Case B)
- [ ] Create a new Neon **project** named `nobc-production` (separate compute, obviously distinct URL). Region = match dev.
- [ ] Do NOT branch from dev — you want zero data.
- [ ] (DB window) apply the schema from empty + the GIN index by hand — see runbook Steps B.3–B.5. **Never `db push`.**
- [ ] Verify zero rows + `Asset_searchVector_idx` present.

### 🟪 Clerk
- [ ] (Case B) In the **prod** instance (`app.thenobadcompany.com`): create your org (workspace/tenant); note the org ID → it seeds the Workspace row.
- [ ] Confirm the **dev** instance (`allowed-zebra-34`) keys are what Preview uses (after the Vercel change above).
- [ ] Add operator team members to the prod org (so they get `WorkspaceMember` rows).

### 🟨 Stripe
- [ ] **Test mode:** create a webhook endpoint → `https://<staging-url>/api/webhooks/stripe` → copy signing secret into Vercel **Preview** `STRIPE_WEBHOOK_SECRET`.
- [ ] **Live mode:** create a webhook endpoint → `https://app.thenobadcompany.com/api/webhooks/stripe` → copy signing secret into Vercel **Production** `STRIPE_WEBHOOK_SECRET`.
- [ ] Confirm **Live mode** is activated and `sk_live_`/`pk_live_` keys exist.

### 🧪 Rehearse → go live (runbook §4)
- [ ] Full money-path dress rehearsal in **staging** (Stripe test): create → register → pay (4242…) → approve/capture → access gate → check-in → refund.
- [ ] **$1 live Stripe test in prod:** real card → capture → refund → delete the test event. (The only real proof.)
- [ ] Create the **real** June-20 event in prod, publish, share internally.

### 🟧 Replit (Producer) — parallel track
- [ ] Hand the Producer Agent the brief in `PRODUCER-MIGRATION-BRIEF.md` (P0 first: set `PRODUCER_WORKSPACE_ID`, lock the export endpoint; then the migration-prep inventory).

### 🔀 One open decision (affects Replit task 8 only — not blocking)
- [ ] **Converge Producer into NoBC OS, or keep it standalone?** Decides whether Producer's data migrates into NoBC's DB or its own.

---

## Live-config issues found 2026-06-12 (so they're not lost)
1. **Production env vars are "Sensitive"** → unreadable in dashboard/CLI (expected; that's why you couldn't see them).
2. **Preview has no Stripe keys** → staging checkout impossible until added.
3. **Preview uses the prod Clerk instance** (`pk_live_…app.thenobadcompany.com`) → staging auth hits the live member pool against a seeded dev DB (identity mismatch). Repoint Preview to dev Clerk.
4. **Prod `DATABASE_URL` is a separate entry from Preview** (good — not shared "all-environments"), but its value is sealed, so the clean-vs-dirty question is answered by the browser check, not config.
