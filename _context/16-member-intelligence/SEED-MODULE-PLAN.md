# Demo Seed Module — Plan (for review)

_Planning doc only. No code in this file. Grounds a journey-consistent demo-seed module in the real apply→approve flow mapped in the architecture investigation. Author: away-session. Status: **decisions locked — awaiting build approval.**_

---

## 1. Why this exists

The current one-off (`scripts/seed-member-record-demo.ts`) hard-sets columns on a single pre-existing member. That's fine for a one-page smoke test but it's **not journey-consistent**: the rows it produces don't look like a real person who applied, got approved, and attended. For demos (and the tenant-2 backbone) we want demo data that is **indistinguishable from real journeys** — because it was created *through the same code paths* a real person flows through.

This module seeds personas **through the real funnel helpers**, not raw inserts:

```
resolveMember()  ─►  Application (prebaked AI fields)  ─►  approveApplication() / reject / waitlist
       │                                                          │
       └───────────────►  logEngagementEvent() × N  ◄─────────────┘
                                   │
                          applyFieldWrites()  +  MemberPsychographics
```

Every row lands the way production lands it: a GUEST Member minted at "apply", promoted **in place** to APPROVED, with a real engagement timeline and provenance-stamped fields.

---

## 2. Grounding — the real flow this module mirrors

Confirmed from the codebase (read-only):

| Step | Real entry point | What it does | Seed uses it |
|---|---|---|---|
| Person exists | `resolveMember({ workspaceId, email, name?, phone?, clerkUserId?, source })` (`lib/member-identity.ts`) | find-or-create Member as **GUEST / approved:false**, synthetic `clerkUserId = guest:\|applicant:<id>`, mints `memberQrCode`, logs `guest_created` | ✅ directly |
| Application | `db.application.create({ data: { …, memberId, status, aiScore, archetype, archetypeScores, aiReasoning, aiRecommendation, aiTags } })` (apply route shape) | links Application→Member at submission | ✅ create the row in the **same shape**, with **pre-baked** AI fields (see §9 — do NOT call the live scorer) |
| Approve | `approveApplication({ applicationId, workspaceId, actorId, actorType?, reviewNote? })` (`lib/applications/approve.ts`) | resolves the GUEST member, promotes **in place** to APPROVED, links `memberId`, then `emitEvent` (**AuditEvent + Svix**), welcome email, wallet pass | ✅ directly — **with `suppressSideEffects` (§10)**: all outbound (email, wallet, **Svix**) skipped |
| Reject (retained) | reject route sets `Application.status='REJECTED'`, **never touches the Member**, then `emitEvent` (**AuditEvent + Svix**) + rejection email | rejected-but-retained = Member stays GUEST | ✅ replicate via a shared reject helper: set REJECTED + `rejectionReason`, **`suppressSideEffects`** skips email + Svix |
| _(any path)_ | `emitEvent` (`lib/emit-event.ts`) | always writes `AuditEvent`; **dispatches Svix** to `workspace.svixAppId` subscribers when `SVIX_API_KEY` set | ✅ seed passes `suppressSideEffects` → keeps the internal AuditEvent, **skips the Svix dispatch** |
| _(events only — not member roster)_ | `notifyProducer('event.*', …)` (`lib/producer-webhook.ts`) | HMAC webhook to Producer (Replit); fired only by `/operator/events*` | ✅ not triggered by the member roster; same flag must gate it **if** the seed ever creates/publishes Events |
| Engagement | `logEngagementEvent({ workspaceId, memberId, eventType, metadata })` (`lib/engagement.ts`, never throws) | appends a `MemberEngagementEvent` | ✅ directly, with `metadata.demo=true` |
| Fields + provenance | `applyFieldWrites({ customFields, fieldProvenance, writes, syncedAt })` (`lib/member-provenance.ts`) | the exact PATCH stamping `{ value, source, confidence?, syncedAt }` | ✅ directly |
| Psychographics | separate `MemberPsychographics` table (firewalled) | archetype/scores live off the sponsor surface | ✅ direct table write for approved personas |
| First-class dimensions | `member.update({ companyName, city, country, … })` | firmographic/demographic columns | ✅ directly |

**Design rule:** the seed never invents a shortcut that production doesn't have. If production mints a member via `resolveMember`, so does the seed.

---

## 3. Module shape (proposed)

```
scripts/demo-seed/
  index.ts        # CLI: --workspace, --execute, --purge, --ref-date, --only; dry-run default
  personas.ts     # declarative roster (data only — see §6)
  pipeline.ts     # the "seed through real paths" engine (calls the §2 helpers)
  demo-tag.ts     # tagging conventions + filters (§4)
  purge.ts        # FK-ordered teardown keyed on the demo tag (§7)
```

- Reuses real lib functions (`resolveMember`, `approveApplication`, `logEngagementEvent`, `applyFieldWrites`) — no duplicated funnel logic.
- **Supersedes** `scripts/seed-member-record-demo.ts` once shipped (that file is left untouched by this plan; deprecate later).
- Pure Node script run via `tsx --env-file=.env.local` (the established pattern; `npx prisma` is broken in this env).

---

## 4. Demo tagging — unmistakable + filterable

Demo rows must be trivially identifiable on a **shared-prod DB**. Four redundant markers:

1. **Email convention:** every persona uses `<seedKey>.demo@nobadco.dev` — a sink domain (no real inbox), and a `LIKE '%.demo@nobadco.dev'` filter.
2. **Member tag:** `member.tags` includes `"demo"`.
3. **Provenance control marker:** `fieldProvenance._demo = { seedKey, batch, seededAt }` — a non-rendered control entry (same trick as the grandfather script's `_grandfather`). The F3 UI only renders known field keys, so `_demo` never surfaces.
4. **Engagement metadata:** every seeded event carries `metadata.demo = true` and `metadata.seedKey`.

`demo-tag.ts` centralizes these (the email builder, the tag constant, the filters) so seed and purge agree.

---

## 5. Idempotency, scoping, env-awareness

- **Stable key:** each persona has a `seedKey` (e.g. `celia-moss`). The natural upsert key is the `@@unique([workspaceId, email])` on Member — email is derived from `seedKey`, so re-runs converge.
- **Upsert-by-key:** Member/Application/fields use find-or-update by `(workspaceId, email)`. Engagement timeline is **delete-then-recreate scoped to `metadata.demo=true AND seedKey`** so re-runs produce a deterministic feed (no duplicate events) without touching real events.
- **Workspace-scoped:** every read/write carries `workspaceId`. Nothing global.
- **Env-aware:** `--execute` required to write (dry-run default prints the plan + counts). `--ref-date` anchors timelines deterministically (avoids drift between runs / `Date.now()` skew).
- **Dry-run parity:** dry-run reports exactly what execute would create/update/skip, per persona.

---

## 6. Persona roster (8, expandable to 10)

Spans every lifecycle state, all five provenance sources, a merge pair, and a referral connector — so it backs Slices 1–5, not just the record page.

| # | seedKey | Name | Lifecycle / status | Path seeded through | Provenance sources on fields | Timeline highlights |
|---|---|---|---|---|---|---|
| 1 | `celia-moss` | Celia Moss | **MEMBER** (APPROVED) | resolveMember → app → approveApplication | operator_entered, producer, verified_enrichment, self_reported, ai_inferred (**all 5**) | guest_created → app_submitted → app_approved → ticket_purchased → checked_in (9 events / 4 days) — flagship |
| 2 | `hugo-vogel` | Hugo Vogel | **APPLICANT — PENDING** | resolveMember → app (status PENDING) | self_reported ×2 | guest_created → application_submitted |
| 3 | `tomas-reyes` | Tomas Reyes | **REJECTED-RETAINED** (Member GUEST, App REJECTED) | resolveMember → app → reject (App-only) | self_reported | guest_created → application_submitted → application_rejected (+ `rejectionReason`) |
| 4 | `priya-anand` | Priya Anand | **GUEST** (never applied; event-access funnel) | resolveMember (source: event access) | — (lean profile) | guest_created → rsvp_confirmed → checked_in |
| 5 | `dao-nguyen` | Dao Nguyen | **WAITLISTED** (App WAITLISTED, Member GUEST) | resolveMember → app → waitlist | self_reported, ai_inferred | application_submitted → waitlist_joined |
| 6 | `sven-larsson` | Sven Larsson | **MEMBER** (enrichment-heavy) | resolveMember → app → approve | verified_enrichment ×2, producer | app_approved → ticket_purchased → plus_one_added → checked_in |
| 7 | `lila-okonkwo` | Lila Okonkwo | **MEMBER** (AI-inferred-heavy; referrer) | resolveMember → app → approve | ai_inferred ×3, verified_enrichment | app_approved → referral_made → checked_in |
| 8a/8b | `jon-park` / `jonathan-park` | Jon Park / Jonathan Park | **MERGE PAIR** (canonical APPROVED + GUEST dupe, same person via email/instagram) | two resolveMember calls; canonical approved | operator_entered | dupe: guest_created; canonical: app_approved → checked_in (+ a `merged` event after Slice 4 merge) |

Optional 9–10 for later: a **red-listed applicant** (exercises the apply red-list short-circuit) and a **high-referral connector** with several `referredByMemberId` children (backs the Slice 5 referral tree).

**Provenance coverage check:** self_reported (2,3,5), operator_entered (1,8), ai_inferred (1,5,7), verified_enrichment (1,6,7), producer (1,6) → all five present, multiple times.

**Lifecycle coverage check:** GUEST (4, 8b), PENDING applicant (2), WAITLISTED (5), APPROVED member (1,6,7,8a), REJECTED-retained (3). The rejected-retained case deliberately demonstrates the §architecture gap: the Member stays GUEST; "rejected" lives only on the Application.

---

## 7. Teardown / purge (keyed on the demo tag)

`--purge` (workspace-scoped, demo-tag-keyed, FK-ordered so nothing orphans):

1. `MemberEngagementEvent` where `metadata.demo = true` (+ workspace).
2. `MemberPsychographics` for demo members.
3. `RSVP` / `Ticket` / `WaitlistEntry` rows owned by demo members (only those the seed created).
4. `Application` where `email LIKE '%.demo@nobadco.dev'` (+ workspace).
5. `Member` where `tags @> {demo}` OR `email LIKE '%.demo@nobadco.dev'` (+ workspace).

Purge is **dry-run by default** and requires **both `--execute` and `--workspace`** (no implicit default workspace for a destructive op). Optional `--purge --only=<seedKey>` for a single persona.

**Hard guarantee (locked):** every purge predicate is the conjunction of (a) the named `workspaceId` **and** (b) a demo tag (`metadata.demo=true`, `tags @> {demo}`, `fieldProvenance._demo`, or `email LIKE '%.demo@nobadco.dev'`). Purge **can only ever delete demo-tagged rows inside the named workspace** — it can never match an untagged row, and never a row in another workspace. A row missing the demo tag, or in a different workspace, is structurally out of scope. Build must include a unit test asserting purge never selects an untagged or cross-workspace row.

---

## 8. Workspace parameterization (prod-org **or** dev-instance)

- `--workspace=<slug|id>` resolved via `db.workspace.findUnique`. Default from `DEMO_SEED_WORKSPACE` env, else the prod-org slug `no-bad-company-1779145308231524145` (id `cmpd6xckn…`).
- **Local-dev path:** with dev Clerk keys, the operator's Clerk org maps to a *different, empty* workspace. Point the seed at that workspace id → the roster populates the dev workspace so Slice 1–5 are reviewable locally. This is the parameter that makes local review possible once dev keys are in place.
- **Clerk-user note (out of scope):** the seed creates **data rows** with synthetic `clerkUserId` (`guest:`/`applicant:`), which is exactly how guests/applicants exist in prod. It does **not** provision real Clerk login accounts for approved demo members — if a demo persona needs to actually *sign in*, that's a separate Clerk-side step, flagged not built.

---

## 9. AI fields — pre-baked, never the live scorer

Production scores applications via `tagApplication` (`lib/ai/tag-application.ts`), a **live model call** (locked `claude-sonnet-4-20250514`, real cost). The seed must **not** invoke it. Instead each persona declares deterministic AI fields (`aiScore`, `archetype`, `archetypeScores`, `aiReasoning`, `aiRecommendation`, `aiTags`) that are written **directly onto the Application row** — the same columns `tagApplication` would have filled. This keeps demo data journey-consistent (the rows are identical in shape) while honoring the "**do not touch AI scoring / config/archetypes.ts**" constraint. Archetype is mirrored to `MemberPsychographics` for approved personas (the firewalled table), not left only on the Application.

---

## 10. Safety (shared-prod DB) — outbound side effects HARD-SUPPRESSED

The funnel helpers fan out to **real subscribers**. Seeding through them is only safe if **every outbound side effect is suppressed by an explicit seed-mode flag — never by env-guards.** Env-guards are insufficient: `SVIX_API_KEY` is currently unset but is code-complete and could be set at any time, and the prod workspace can gain a `svixAppId` — at which point env-gated seeding would silently fan demo approvals/rejections to real Svix subscribers. The flag is unconditional.

**Locked: the build introduces a single `suppressSideEffects: true` (seed-mode) option, threaded through `approveApplication`, a shared reject helper, and `emitEvent` (production default `false`).** The seed always passes it.

**Outbound side-effect matrix (ALL suppressed in seed mode, always):**

| Side effect | Trigger | Real-world fan-out | Suppression |
|---|---|---|---|
| Welcome / rejection **email** | `approveApplication`, reject path | Resend → real inbox | seed flag skips the send (sink `*.demo@nobadco.dev` is a *second* layer, not the primary guard) |
| **Wallet pass** | `approveApplication` → `generateMemberPass` | PassNinja API | seed flag skips |
| **Svix outbound webhook** | `emitEvent` → `getSvix()` + `svix.message.create(workspace.svixAppId, …)` | **fans the demo event to the workspace's real Svix subscribers** whenever `SVIX_API_KEY` + `workspace.svixAppId` are set | seed flag skips the **Svix dispatch**; the internal `AuditEvent` row is still written, demo-tagged |
| **Producer webhook** | `notifyProducer('event.*', …)` — **event-scoped only** (`/operator/events*`); NOT in approve/reject | Producer (Replit) via HMAC `X-NoBC-Signature` | not triggered by the member roster; **if** the seed ever creates/publishes Events, the same flag must gate `notifyProducer` |

- **Internal writes are kept** (and demo-tagged): `AuditEvent`, `MemberEngagementEvent` — DB-internal, not outbound.
- **No live AI:** §9. **No schema / db push:** additive only; **never** `prisma db push`, never touch `Asset_searchVector_idx`.
- **Idempotent + purgeable:** §5, §7. **Workspace-scoped + dry-run default:** nothing writes without `--execute`.
- **Design/terminology untouched:** the seed produces data only; no UI/token surface.

> **Build note:** threading `suppressSideEffects` through `approveApplication` / the reject helper / `emitEvent` is a small, production-default-`false` change that ships **with** the seed module — it is the mechanism that makes journey-consistent seeding safe. Documented here, not built this pass.

---

## 11. CLI surface (proposed)

```
tsx --env-file=.env.local scripts/demo-seed/index.ts \
  --workspace=<slug|id>     # default: $DEMO_SEED_WORKSPACE or prod-org slug
  [--execute]               # default: dry-run
  [--purge]                 # teardown (demo-tag-keyed); dry-run unless --execute
  [--ref-date=2026-06-01]   # anchor timelines deterministically
  [--only=celia-moss,hugo-vogel]   # subset
```

---

## 12. Locked decisions (resolved — build to these)

1. **Side-effect suppression:** **hard-suppress ALL outbound side effects in seed mode, always — not env-dependent.** Explicit `suppressSideEffects` flag threaded through `approveApplication`, the shared reject helper, and `emitEvent`, covering email, wallet, **Svix**, and the **Producer webhook** (the latter only if Events are ever seeded). Sink emails are a second layer, not the primary guard. See §10.
2. **Module location:** **`scripts/demo-seed/`.**
3. **One-off `seed-member-record-demo.ts`:** **KEEP for now** as the Slice 1 smoke test. Retire **only** after this module is proven *and* Slice 1 is committed. Do **not** modify or delete it (this plan does not touch it).
4. **Clerk-user provisioning:** **synthetic `clerkUserId` only** (`guest:` / `applicant:` pattern), in both dev and prod. **No real Clerk users** for demo personas. (Persona sign-in, if ever needed, is a separate out-of-scope step.)
5. **Purge:** **workspace-scoped, FK-ordered, demo-tag-keyed, dry-run default, requires both `--execute` and `--workspace`.** Confirmed hard guarantee (§7): purge can **only** delete demo-tagged rows in the **named** workspace — never untagged rows, never cross-workspace rows; enforced by predicate construction + a unit test.
6. **Tenant-2 timing:** **not gated by the module.** Workspace-parameterization makes tenant-2 seeding free (§8, §14); the *timing* of actually seeding a tenant-2 workspace is decided separately, later.

---

## 13. Out of scope (this module / this session)

- Writing the seed code (this is a plan only).
- Provisioning real Clerk users / changing Clerk keys or env.
- Any schema or migration change.
- The locked AI scorer (`tagApplication`, `config/archetypes.ts`) — pre-baked fields only.
- The Slice 1 UI tree (untouched).

---

## 14. How it doubles as the tenant-2 demo backbone

Because the entire roster is **workspace-parameterized** and seeded **through the real funnel**, pointing `--workspace` at a second tenant's workspace produces a complete, believable member base for that tenant in one command — a guest funnel, pending applicants, approved members with provenance-rich profiles, a rejected-retained case, a merge pair, and a referral connector. That's the multi-tenant SaaS demo backbone: identical code, different `workspaceId`, instantly populated tenants that look like they've been operating for months.
