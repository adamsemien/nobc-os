# Operator-Surface Gap Closure — Final Report

**Date:** 2026-07-07 · **Branch:** `fix/operator-gap-closure` (worktree off `feat/crm-merge-queue` @ `f8a6561`, **NOT merged — Adam's review gates everything**)
**Source:** the 2026-07-06 full operator-surface audit (10-agent read-only pass over every page under `app/operator/**`, graded against the list/detail/destructive/async/cross-cutting baseline).
**Verification:** `tsc --noEmit` 0 errors · `next build --turbopack` succeeds (143 static pages, 249 routes) · vitest 1104 passed / 4 failed — **all 4 failures proven pre-existing at the base commit** (apply-route tests from the concurrent /apply archetype rework; this branch touches zero apply files) · `lint` exit 0 with no messages in changed files.

> **For the next Claude session:** every claim below is committed on this branch with file:line evidence in the commit messages. The "NOT closed" section is the honest remainder — each item says exactly why it was left, and what unblocks it. Do not re-close deliberate gaps; do not touch People/Organizations/import/merge surfaces without checking Campaign 1's state first.

---

## 1. CLOSED — 15 commits

| # | Commit | What closed |
|---|---|---|
| 1 | `2bc36ee` | **SECURITY (was live in prod): cross-tenant hole.** `getAudienceNarrative`/`regenerateAudienceNarrative` were ungated `'use server'` endpoints accepting client-supplied `workspaceId` — any signed-in user could read another workspace's AI audience narrative. Both now gate ADMIN internally and derive workspace from the session. **Cherry-pick this first if the branch stalls.** |
| 2 | `0cf5671` | **held/"Waitlisted" broken Approve** (open since the 2026-06-26 audit): held = paid authorize-hold, now badged "Hold"; Approve renders only for `pending_approval`. |
| 3 | `95c2e0f` | **Audit log entity resolution was dead code** (lowercase match vs uppercase emitters) — fixed case-insensitive + event-title resolution; entityType label map (RSVP→Access); `rsvp.*` actions display as `access ›`; subtitle de-RSVP'd. |
| 4 | `48ce1b6` | Cancel event now confirms (it mass-emails attendees). **Bulk delete refuses events with live Stripe money** (authorized/captured/disputed → 409 with counts) instead of orphaning funds; stops erasing deleted events' audit rows; clears FK-restricting children (questions/workflows/waitlist) and 409s honestly on gate tickets/orders/blasts instead of crashing on P2003. Stale refund-route comment corrected (ADMIN→payment.refund/OWNER). |
| 5 | `5356a75` | Applications queue: single reject (click or `r`) confirms before emailing; Hold got a footer button; **WAITLISTED applications are visible** (real tab + counts + actionable detail bar — they previously silently remapped to PENDING and rendered a dead footer); zero-hit search shows an honest message. |
| 6 | `e5a0a3d` | Members: **Block was UI-irreversible while the confirm promised reversal** — Unblock/Remove-from-Purple bulk affordances added (API already supported them), confirm copy names the real path, bulk tag/untag now audit. |
| 7 | `9b1464e` | Six silent failures now surface: events/new (silent redirect ate input), settings/application + communications (failed fetch rendered an empty editor whose Save would soft-delete every question), settings/lists (optimistic delete ignored `res.ok` + no confirm), Room promote (rejections invisible on an all-night screen), DAM grid (fetch error read as empty library — now Retry banner). |
| 8 | `54bee39` | **Events list baseline**: server-side search/status/date filters/sort, total count, 50-page pagination (URL-driven toolbar); the unbounded events×RSVPs fetch is gone; mapped status labels; "access records" copy. |
| 9 | `31103e5` | Members roster bounded (take 1000 + total, honest truncation subtitle); Guest/Comp drawer-creates no longer prepend a row that vanishes on reload (honest toast instead). |
| 10 | `268dbc7` | **Sponsors: dormant `[id]` GET/PATCH/DELETE API wired into the UI** (inline row edit, dependency-guarded delete + confirm); Add hidden for non-ADMIN (STAFF previously got a guaranteed 403); count + Added dates; all sponsor writes now audit (previously none). |
| 11 | `4fbd4a6` | **DAM/share audit events** (asset.trashed/restored/purged, share.created/revoked — previously zero across `app/api/media/**`); **Stories' broken Schedule & Publish removed** (generate persists no rows → schedule always 404'd; the promised publish cron doesn't exist; the success toast could never be true) — honest Download-story flow instead. |
| 12 | `c67bd77` | **Model switcher placebo removed** (`Workspace.aiModel` had zero runtime consumers; offered an off-policy model) → read-only two-tier policy display; dead component/route/lib deleted. **Team Clerk-floor trap closed**: demote/remove of a Clerk org admin used to report success while OWNER access persisted (removal even hard-deleted the grant row) — API now 409s with the real path (Clerk), rows badge "Managed in Clerk", removal confirms. |
| 13 | `3ecfc75` | Terminology sweep (operator "RSVP" copy → Access law, incl. metric labels and the House Phone donut via display-map so stored data doesn't fork); raw-enum label maps (event/series status, enrichmentStatus, missionType); `loading.tsx` skeletons for 10 DB-backed segments; orphaned `RsvpList.tsx` deleted. |
| 14 | `f93be3a` | **Resend ticket** (June audit item 3, "no operator path re-sends a lost QR email"): new STAFF route + Attendees-tab row action, audited, honest 503 without `RESEND_API_KEY`. |
| 15 | `26e4d9e` | CONTEXT.md closing checklist for stages 02/03/04/07/12/15. |

**Also closed without code:** the "refunds are unaudited" audit finding was **false** — `lib/commerce/refund.ts` already emits `rsvp.refunded`/`rsvp.cancelled` via `emitEvent` (the audit agent grepped for the literal string "audit" and missed the emitter). Verified, documented, no change.

## 2. NOT CLOSED — and exactly why

**A. Deliberate sequencing decisions (closing them would violate documented plans):**
- People list search/filter/sort — R0 read-only scope (`_context/16-member-intelligence/CONTEXT.md:42-44`); Campaign 1 is actively unfreezing this.
- Person merge queue UI — Phase 2B "needs explicit unfreeze"; the engine (`lib/crm/person-merge.ts`) is built, consumers are Campaign 1's deliverable.
- CSV import commit path — lands "in the Contact-spine schema window"; preview is deliberately write-free. (Note: commit + connector routes exist on unmerged `feat/ac-import-phase1` — reconcile branches before rebuilding.)
- Member identity/status inline edit, member delete, consent action layer, DAM Phases 3/5/6 + Wave 4, wallet passes (`PASSNINJA_*`), Svix (`SVIX_API_KEY`), attendee-messaging scheduling/segments, gate-review surface (spec Phase C), paid waitlist promotion, event hard-delete ("drafts via database" by design), Questions tab hidden from nav (V1.5).

**B. Owned by the concurrently-running Campaign 1 session (editing the same tree — collision risk):**
- Organizations edit/delete + person↔org affiliation writes; People CRUD polish (their uncommitted work landed mid-audit as `3fb2fdb`); `loading.tsx` for people/organizations segments.

**C. Product decisions only Adam can make (flagged, not decided):**
- Refund permission tier: CLAUDE.md documents ADMIN; code ships `payment.refund` = OWNER (ADMINs currently 403). Which is right is policy — the doc or the matrix must change.
- DAM permanent delete (irreversible R2 purge) at STAFF vs ADMIN.
- Bulk event delete at STAFF vs ADMIN (money guard now protects the worst case).
- Tier-delete child handling: deleting a membership tier still silently widens event access (`minTierId → null → 'low'` bucket = everyone qualifies) — needs a policy (block? warn? remap?).
- Stories publish pipeline: build it (persist rows + cron + `isConfigured()` wiring + `INSTAGRAM_*` env) or kill the feature. UI is now honest either way.
- `/api/mcp` external Bearer write path — needs its own auth design (long-standing, unchanged).

**D. Needs schema changes (additive-migration protocol against the shared Neon DB — not freelanced under "nothing will break"):**
- Asset tagging status/error field (AI-tagging failures remain structurally invisible — no column to surface).
- House Phone persisted read-state (mark-as-read), conversation archive.
- Saved-view/collections models (DAM Wave 4), reporting-contract gated items.

**E. Sized as future campaigns (M/L — not one-branch work; briefs recommended):**
- Members/Applications server-side search + pagination (client-side over a now-bounded fetch is honest at current scale; the cliff is documented).
- Audit-log filters/search/CSV export + metadata display (the resolution *bug* is fixed).
- House Phone search/filters; intelligence saved-report delete (+ fix the CONTEXT doc that claims it exists); recap generated-asset history + survey-dispatch confirm; check-in operator identity in the audit trail (`'staff-checkin'` constant — token carries no operator id); Room hex-palette redesign (night surface is design-intentional; only new violations were avoided); remaining decorative hex literals (confetti, wax seal, constellation); dashboard dead fetches (documented as tolerated in stage 07).

**F. Known-stale docs NOT rewritten (flagged for a docs pass):** CLAUDE.md still documents the 3-role model (code ships OWNER>ADMIN>STAFF>READ_ONLY + permission matrix + OWNER floor); stage 10 CONTEXT describes the superseded v1 AI builder; stage 17 says "unmerged by design" while the rebuild sits in this tree; CRM-AUDIT claims import routes DONE that live on an unmerged branch; connectors page cites a spec file that doesn't exist; stage 12 CONTEXT claims report delete+audit that don't exist.

## 3. Environment facts a future session must know

- **This branch's base moved during the work**: audit ran at `7603982`; Campaign 1 then committed People CRUD (`3fb2fdb`) + three /apply archetype commits; this branch is based on `f8a6561`. The main checkout has since moved to `feat/apply-new-six`, and `~/code/nobc-os-crm` holds a checkout of `main` @ `53b0d79`. **Merge-target choice is Adam's.**
- The 4 failing vitest files (`apply-create-route`, `apply-submit-route`) fail identically at the base commit — they belong to the /apply rework, not this branch.
- The worktree needed its own `npm ci` (Turbopack panics through a symlinked node_modules) and symlinked `.env*` files; `.env.local.example` is tracked — don't clobber it with a symlink.
- No schema changes, no DB contact, no `db push`, no legal copy, no `/apply` or archetype files touched, locked email sender + two-tier model policy respected throughout.
