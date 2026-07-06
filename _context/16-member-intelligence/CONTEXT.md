# Stage 16 — Member Intelligence / CRM Spine

> The person-centric CRM substrate: Person as the universal base record, Member as a
> membership profile ON a Person, Organization/PersonOrganization as the account layer,
> consent floor (ChannelSubscription/SuppressionEntry), identity resolution, and the
> sponsor firewall. Deal objects are Phase 2B.

## Status

| Field | Value |
|---|---|
| **State** | 🟡 In progress — Phase 2A (Person spine) built on `feat/crm-person-spine`, unmerged; awaiting Adam's SQL + review |
| **V1 item** | — (post-V1, CRM substrate) |
| **Last updated** | 2026-07-06 |
| **Owner** | Adam |
| **Blocked on** | Adam: run NEON Block 1 (additive DDL) → merge/deploy `feat/crm-person-spine` → run NEON Block 2 (backfill) → verification. SQL blocks live in the Gate 2 report (session 2026-07-06); nothing may touch the DB except Adam. |
| **Next** | Adam reviews the Gate 2 report + branch, runs Block 1 in Neon, deploys, runs Block 2, then walks the verification queries + `/operator/people` checks. After cutover: Phase 2B (Deal objects, Person merge queue, Person-level consent — needs explicit unfreeze). |

## Phase 2A — what shipped on `feat/crm-person-spine` (2026-07-06)

- **Schema (additive only):** `Person` (nullable identity keys; `emailVerified`;
  `potentialDuplicateOfId` merge-queue flag; soft-merge mirrors Member; email
  deliberately NON-unique per the verified-email policy), `Organization`,
  `PersonOrganization`; nullable `personId` on Member / Application / RSVP (dormant
  seam) / ContactSource / MemberEngagementEvent / ChannelSubscription /
  SuppressionEntry; `ContactSourceSystem` +clerk/application/event;
  `TagEntityType` +person/organization; engagement enum +account_created/+application_started.
- **`resolvePerson()`** (`lib/crm/resolve-person.ts`) — the ONE Person mint path.
  Identity policy (locked): clerk id authoritative; VERIFIED email links; UNVERIFIED
  email NEVER links (mints + flags potential duplicate — no operator exception);
  phone only when nothing stronger exists; P2002 race recovery; workspace-scoped.
- **Wiring:** hook inside `resolveMember()` (covers apply draft/submit, approval,
  plus-one, signed-in access paths); claim flow stamps the Person; Clerk
  `user.created` webhook (`app/api/webhooks/clerk/route.ts`, svix-verified,
  fail-closed on `CLERK_WEBHOOK_SECRET` / `APPLY_DEFAULT_WORKSPACE_ID`, NO
  oldest-workspace fallback); operator manual add; MCP approve tool. Event
  participation paths (guest submit / payment / comp / gate session) deliberately
  deferred — `RSVP.personId` is the dormant seam.
- **Consent writers (scoped unfreeze):** `lib/comms/consent-sync.ts` +
  `lib/comms/suppression.ts` accept and write `personId` ALONGSIDE `memberId` —
  nothing else changed in either file. `ChannelSubscription.memberId` stays NOT NULL.
- **Operator surfaces (R0):** `/operator/people` (+detail: identity, verified badge,
  provenance, membership card, activity timeline, duplicate banner) and
  `/operator/organizations` (+detail, STAFF-gated create). Nav: People + Organizations.
- **Firewall:** psychographics stay in `MemberPsychographics` (no Person relation);
  `sponsor_audience_member` view untouched; `tests/unit/sponsor-firewall.test.ts`
  extended to bar Person-spine reads from sponsor surfaces.

## Environment variables

- `CLERK_WEBHOOK_SECRET` — Clerk webhook signing secret (endpoint: `/api/webhooks/clerk`,
  subscribe `user.created`). Unset → 401, no mint (fail-closed).
- `APPLY_DEFAULT_WORKSPACE_ID` — the ONLY workspace the Clerk webhook mints into.
  Unset → skip + log (fail-closed; the oldest-workspace fallback is intentionally absent here).

## Files in play

- `lib/crm/resolve-person.ts`, `lib/crm/labels.ts`
- `lib/member-identity.ts` (spine hook), `lib/auth.ts` (claim stamp), `lib/engagement.ts`
- `lib/comms/consent-sync.ts`, `lib/comms/suppression.ts` (scoped unfreeze)
- `app/api/webhooks/clerk/route.ts`
- `app/api/apply/membership/route.ts`, `app/api/apply/[slug]/route.ts`,
  `app/api/operator/members/create/route.ts`, `lib/mcp/tools/applications.ts`
- `app/operator/people/*`, `app/operator/organizations/*`,
  `app/api/operator/organizations/route.ts`, `app/operator/operator-nav.tsx`
- `lib/engagement-labels.ts` (two new enum labels)
- `tests/unit/crm/resolve-person.test.ts`, `tests/unit/sponsor-firewall.test.ts`
- `prisma/schema.prisma` (Person/Organization/PersonOrganization + personId columns)
- Pre-existing stage docs: `OPERATOR-CRM-ROADMAP.md`, `INFLUENCE-MODEL.md`,
  `PR2-PR3-BUILD-BRIEF.md`, `REPORTING-DASHBOARD-CONTRACT.md`, `SEED-MODULE-PLAN.md`,
  `SLICE-2-PLAN.md`, `AWAY-SESSION-NOTES.md`
