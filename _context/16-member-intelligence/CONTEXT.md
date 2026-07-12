# Stage 16 — Member Intelligence / CRM Spine

> The person-centric CRM substrate: Person as the universal base record, Member as a
> membership profile ON a Person, Organization/PersonOrganization as the account layer,
> consent floor (ChannelSubscription/SuppressionEntry), identity resolution, and the
> sponsor firewall. Deal objects are Phase 2B.

## Status

| Field | Value |
|---|---|
| **State** | 🟡 In progress — Phase 2A LIVE in prod; Phase 2B Campaign 1 (merge queue + spine hardening + People/Org CRUD) built on `feat/crm-merge-queue`, unmerged, ZERO DDL. Consent reconciliation Phase 1+2 (single writer + suppression writers + emitted backfill) built on `consent-reconciliation`, unmerged, ZERO DDL, zero DB contact |
| **V1 item** | — (post-V1, CRM substrate) |
| **Last updated** | 2026-07-11 |
| **Owner** | Adam |
| **Blocked on** | Adam: (1) review + merge `consent-reconciliation` (Phase 1+2 build, this entry), then run `prisma/sql/consent-backfill-phase2.sql` in the Neon console and walk its verification SELECTs. (2) Review + merge `feat/crm-merge-queue` (8 commits incl. the sponsor-narrative security fix). Also: `feat/apply-new-six` still carries the accidental People-CRUD commit `3fb2fdb` — restore its tip to `a2acfb3` once that stream pauses (content is cherry-picked onto this branch as `d034cbf`). |
| **Next** | 2026-07-11 — CONSENT RECONCILIATION PHASE 1+2 built on `consent-reconciliation` (committed local, NOT pushed; Adam's post-GO order, decisions locked): (1) `lib/comms/consent-writer.ts` — THE single consent writer; every consent mutation converges person-keyed canonical row + member-keyed mirror row(s) + Member marketing booleans in one transaction, under the locked conflict rule (Suppression > explicit UNSUBSCRIBED > explicit opt-in > no signal; recency ties within a tier only; missing timestamp never wins; 'explicit' mode for fresh first-party signals so re-subscribe after unsubscribe is lawful). (2) `syncMemberChannelConsent` rewired onto the writer — "no-downgrade" replaced by most-protective-wins. (3) Operator Person consent route + panel through the writer; NEW Block action (MANUAL_BLOCK SuppressionEntry, distinct copy from marketing-only Unsubscribe per decision 2). (4) Checkout consent (`recordCheckoutConsent`) additive writer call — opt-ins land in ChannelSubscription. (5) MCP `nobc_approve_application` deduped onto canonical `lib/applications/approve.ts` (MCP approves now also send wallet pass + welcome email — previously silently skipped). (6) Import + guest/operator member creation seed PENDING rows (visible, not sendable). (7) Suppression writers finally exist: Resend bounce→HARD_BOUNCE + complaint→SPAM_COMPLAINT, Twilio 21610→CARRIER_REJECT dual-write beside SuppressedContact, operator Block→MANUAL_BLOCK. (8) Member record panel suppression lookup switched to normalized identifier (recon finding 8 — now matches Person panel + canSend). (9) `prisma/sql/consent-backfill-phase2.sql` EMITTED, NOT run — SUBSCRIBED rows both keyings for the 4 blast-eligible member-channel pairs, EXPRESS_OPTIN where *OptInAt evidence exists else IMPORTED_LEGACY, with census-re-run verification SELECTs. Read paths UNCHANGED (blast consent/recipients byte-identical — Phase 3 cutover separately gated). Proof: tsc clean, build clean, suite 1246 pass / 4 fail (the known pre-existing apply-create failures), +39 new tests (writer decision table, webhook suppression, Block route). NEXT ACTION: Adam reviews + merges `consent-reconciliation`, runs the backfill SQL + verification, THEN decides Phase 3 (blast reads move to canSend). Prior: Adam merges Campaign 1, deploys, walks the verification checks (merge queue on the flagged pair, delete of the John Doe junk row, People search/filters, org edit/affiliations). Then Phase 2B Campaign 2 (Deal objects — needs explicit unfreeze). |

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

## Phase 2B Campaign 1 — what shipped on `feat/crm-merge-queue` (2026-07-06, zero DDL)

- **Merge queue:** `lib/crm/person-merge.ts` (`executePersonMerge` — one interactive
  $transaction; collision rows stay on the loser tombstone; clerkUserId transfer
  frees the unique slot first; hard refusals: both-have-members, two different real
  clerk ids), `findDuplicatePairs` (flags + read-time email/phone matches, 500-row
  window, dismissals persisted as `person.duplicate_dismissed` audit events),
  `/operator/people/merge` (STAFF view/dismiss, ADMIN executes).
- **People CRUD:** Add Person (STAFF, through `resolvePerson` — not a new mint path;
  duplicate flag surfaced), inline edit (STAFF, firstName/lastName/phone only),
  hard delete (ADMIN; refuses Members, Applications, and both sides of a merge;
  person-only engagement events cleaned in the delete transaction).
- **List tooling:** URL-driven server-side search / source / verified / membership
  filters + name/added sort on `/operator/people`.
- **Apply draft (D4):** the membership draft mints a Person, NOT a guest Member —
  Members are earned at submit (Door 1) or approval. Every downstream reader
  verified null-safe at Gate 1.
- **Webhook guard:** `lib/clerk-webhook.ts` `isSyntheticClerkUser` — dashboard test
  events (no email + no external account, or Clerk's example user id) skip the mint.
- **Organizations write path:** PATCH (STAFF, domain-normalized, P2002→409) +
  DELETE (ADMIN, refuses while affiliated) + affiliation add/remove from both
  details via `/api/operator/affiliations`; inline edit mirrors the Person pattern.
- **Security (priority insertion):** sponsor narrative server actions
  (`app/operator/intelligence/sponsor/actions.ts`) were ungated and accepted a
  client workspaceId — now `requireRole(ADMIN)`-gated, workspaceId server-derived.

## Environment variables

- `CLERK_WEBHOOK_SECRET` — Clerk webhook signing secret (endpoint: `/api/webhooks/clerk`,
  subscribe `user.created`). Unset → 401, no mint (fail-closed).
- `APPLY_DEFAULT_WORKSPACE_ID` — the ONLY workspace the Clerk webhook mints into.
  Unset → skip + log (fail-closed; the oldest-workspace fallback is intentionally absent here).

## Files in play

- `lib/crm/resolve-person.ts`, `lib/crm/labels.ts`
- `lib/member-identity.ts` (spine hook), `lib/auth.ts` (claim stamp), `lib/engagement.ts`
- `lib/comms/consent-sync.ts`, `lib/comms/suppression.ts` (scoped unfreeze)
- Consent reconciliation (branch `consent-reconciliation`): `lib/comms/consent-writer.ts`
  (THE single writer), `app/api/operator/people/[id]/consent/route.ts` +
  `PersonConsentPanel.tsx` (Block action), `app/api/gate/[token]/route.ts`
  (recordCheckoutConsent, one additive call), `app/api/webhooks/resend/route.ts` +
  `lib/blast/run.ts` (suppression writers), `lib/connectors/ingest/persist.ts` +
  `lib/event-access-submit.ts` (PENDING seeds), `app/operator/members/[id]/page.tsx`
  (identifier-keyed suppression read), `prisma/sql/consent-backfill-phase2.sql`
  (EMITTED, not run), `tests/unit/comms/*`
- `app/api/webhooks/clerk/route.ts`
- `app/api/apply/membership/route.ts`, `app/api/apply/[slug]/route.ts`,
  `app/api/operator/members/create/route.ts`, `lib/mcp/tools/applications.ts`
- `app/operator/people/*`, `app/operator/organizations/*`,
  `app/api/operator/organizations/route.ts`, `app/operator/operator-nav.tsx`
- `lib/engagement-labels.ts` (two new enum labels)
- `tests/unit/crm/resolve-person.test.ts`, `tests/unit/sponsor-firewall.test.ts`
- Campaign 1: `lib/crm/person-merge.ts`, `lib/clerk-webhook.ts`,
  `app/api/operator/people/*` (create/edit/delete/merge/dismiss),
  `app/api/operator/affiliations/route.ts`, `app/api/operator/organizations/[id]/route.ts`,
  `app/operator/people/merge/*`, People/Org `_components/*` (AddPersonSheet,
  EditPersonFields, PeopleToolbar, EditOrganizationFields, AffiliationControls),
  `tests/unit/crm/person-merge.test.ts`, `tests/unit/clerk-webhook-guard.test.ts`
- `prisma/schema.prisma` (Person/Organization/PersonOrganization + personId columns)
- Pre-existing stage docs: `OPERATOR-CRM-ROADMAP.md`, `INFLUENCE-MODEL.md`,
  `PR2-PR3-BUILD-BRIEF.md`, `REPORTING-DASHBOARD-CONTRACT.md`, `SEED-MODULE-PLAN.md`,
  `SLICE-2-PLAN.md`, `AWAY-SESSION-NOTES.md`
