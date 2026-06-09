# Audit → Merge Triage

> Maps the 8-file overnight platform audit (`_context/_audit/today-*.md`) onto the
> Producer↔Operator merge plan (`PRODUCER-OPERATOR-STRATEGY.md`). Purpose: make sure
> no critical finding gets buried while the merge proceeds, and flag which findings
> become *worse* (SaaS-blockers) once a second tenant exists. Severities are the
> audits' own. Drafted 2026-06-09.

> **✅ 2026-06-09 status update — three items below already shipped to main:**
> `/api/mcp` privesc fixed by **#51** (role-gated, default-deny→STAFF); public R2 /
> Vercel Blob exposure fixed by **#50** (uploads moved to private R2); the
> Producer-webhook cross-tenant gap fixed by **#53** (workspace-ownership check on
> publish/update). They remain listed below as the record of *why* they mattered,
> struck through where shipped. Also note PR #62 verified Producer is on a
> **separate** DB + Clerk — so any "shared DB" phrasing here is historical framing,
> not a live risk.

---

## P0 — fix before the corresponding merge phase (blockers)

| Finding | Source | Why it blocks the merge / SaaS |
|---|---|---|
| **Migration-history drift** (~10 objects + `MemberEngagementEventType` 8-vs-18 enum applied via hand-run SQL, not in `prisma/migrations/`) | `today-data.md` → `PHASE-0-SCHEMA-ISOLATION.md` | **Gates ALL schema work** (Phase 0). A new-tenant bootstrap or Producer migrate from tracked history builds a broken schema. Must reconcile first. |
| ✅ **SHIPPED #51.** ~~`/api/mcp` Bearer write path = privilege escalation~~ — any authenticated org member (even READ_ONLY-floor) ran STAFF/ADMIN mutations, bypassing `requireRole` | `today-security.md` | Was the canonical RBAC hole for Phase 1. Now role-gated (default-deny → STAFF). |
| ✅ **SHIPPED #53.** ~~Cross-tenant gap in the Producer webhook `update` branch~~ | `today-backend.md` | Was a multi-tenant data-integrity breach on the Event sync. Now verifies workspace ownership on publish/update. |

## P1 — fix before SaaS tenant #2 (independent of merge sequencing — can start now)

| Finding | Source | Risk |
|---|---|---|
| ✅ **SHIPPED #50.** ~~Unscoped public R2 presign (IDOR)~~ | `today-backend.md` | Was cross-tenant asset access. Now private R2. |
| ✅ **SHIPPED #50.** ~~Membership-application uploads to PUBLIC Vercel Blob~~ | `today-infra.md` | Was applicant PII publicly reachable. Now private R2. |
| **Non-transactional capacity / download counters** | `today-backend.md` | "Fine at NoBC scale, correctness bugs at SaaS scale" — race conditions on capacity/waitlist. Fix before multi-tenant load. |
| **No inbound-SMS idempotency** (Twilio retries re-charge the AI + double-text guests) + **in-memory rate limiter resets every Railway deploy** + **no alerting on silent webhook/queue failure** | `today-reliability.md` | Real money + UX bugs in House Phone. The "queue on failure" the architecture promises doesn't exist in code. Not a merge-blocker, but live-cost today. |

## P2 — quality / debt (schedule around merge refactors)

| Finding | Source | Note |
|---|---|---|
| **Money path (Stripe webhook/capture/refund/payment-intent) + event-access gate have ZERO tests**; lone E2E drives a real AI agent (75s timeouts, `retries:1`) — flakiest surface in CI | `today-qa.md` | **Add coverage BEFORE the merge refactors payments/access** — you're about to touch these surfaces with no safety net. Decouple the AI E2E from CI determinism. |
| **No `global-error.tsx`** | `today-reliability.md` | Root render errors fall through. Quick add. |
| **A11y + performance findings** | `today-frontend.md` | Lowest merge-relevance; independent polish. |
| **`SVIX_*` env name mismatch** (example file ≠ code) | `today-infra.md` | Documented launch blocker can't be cleared by following the example; one-line doc/code fix. |
| **`sponsor_audience_member` view defined but never queried** (real firewall is per-call `select` discipline) | `today-data.md` | Firewall still holds, but the view is dead weight — relevant when CRM spine reworks sponsor reads (Phase 2). |

---

## How this reshapes the merge sequence

- **Phase 0** already absorbs the dominant data finding (drift). Add the **Producer
  webhook cross-tenant gap** to Phase 0's scope — same code path, same risk class.
- **Phase 1 (identity/RBAC)** should explicitly include **killing the `/api/mcp`
  privesc** — it's the headline example of why one RBAC model is needed.
- **P1 security fixes (IDOR presign, public Blob, counters)** have **no merge
  dependency** — they're the best "side work" to ship now while the merge is debated,
  and they're all SaaS-blockers regardless of how packaging lands.
- **Before any merge PR touches payments or the access gate**, land the missing
  money-path + access-gate tests (`today-qa.md`) — otherwise the merge refactors the
  most business-critical, least-tested code blind.

## Remaining order (after #50/#51/#53 shipped)

1. ✅ Public-exposure fixes (R2 IDOR + Vercel Blob → private) — **shipped #50**.
2. ✅ `/api/mcp` RBAC gate — **shipped #51**.
3. **Money-path + access-gate test coverage** — *in progress* (this branch). Safety net for upcoming merge refactors.
4. Non-transactional capacity/download counters — wrap in transactions before multi-tenant load.
5. (DB-coordinated, with Adam) Operator migration-history reconciliation (`today-data.md`).
