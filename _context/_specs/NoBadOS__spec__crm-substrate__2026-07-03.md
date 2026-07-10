# NoBadOS__spec__crm-substrate__2026-07-03.md

**Date:** 2026-07-03
**Status:** DRAFT - for Adam's red pen, then hand to build agent (Opus, fresh full-runway session)
**Author:** scoped with Claude, from live repo audit + prior specs
**Supersedes:** nothing. Extends OPERATOR-CRM-ROADMAP (Slices 1-6), INFLUENCE-MODEL, activecampaign-import-and-suppression-corrected (Appendix A), event-automation-layer.

---

## Purpose

Build the transactional CRM substrate that every higher layer stands on: the consent floor, real contact ingestion, durable segments, the unified comms timeline, and tasks. This is the foundation for No Bad Blast, the lifecycle automation, and the AI intelligence layer. None of those can be built correctly until this exists.

This spec is substrate only. It deliberately does NOT scope: the AI I/O layer (NL-in / NL-out), the No Bad Blast send UI, the automated lifecycle flows, the rules-engine template library, or Tenur MCP federation. Those are separate specs that consume what this one builds. Four platform-shape decisions (message system-of-record, Tenur v1 role, platform naming, dry-run simulation) are deferred to those specs and are NOT required to build this one. That is the point of sequencing the substrate first.

Everything here is additive. No `prisma db push`. No `npx prisma`. Schema changes follow the additive-only law in Section 9.

---

## 0. Ground truth (from the 2026-07-03 repo audit)

What already exists and must be reused, not rebuilt:

- **Member model** - built (`prisma/schema.prisma:222-331`). Carries `marketingEmailOptIn/At`, `marketingSmsOptIn/At`, `status`, `tags String[]`, `referredByMemberId`, `customFields`, `fieldProvenance`, firmographics, `mergedIntoId/At`. No `houseAccount*` fields exist (memory was wrong on that).
- **Person record 360 page** - built, partial scope (`app/operator/members/[id]/page.tsx`). Renders header, timeline, notes (CommentThread), editable panels, SphereOfInfluence. Does NOT render application answers, events attended, payments, or comms.
- **Inline edit, manual create, Cmd+K to people** - all built (Slices 1-2).
- **Notes** - built. `OperatorComment` model (`schema:1473-1491`), polymorphic `entityType/entityId`, renders on the record.
- **Referral spine (INFLUENCE-MODEL Layer 1)** - built. `Member.referredByMemberId` self-relation, SphereOfInfluence card, referrer-edit API. Layer 2 (co-attendance) is coded in `lib/member-connections.ts` but "available but not exposed". Layer 3 (explicit override / MemberRelationship model) not built.
- **Tag + EntityTag** - built (`schema:1329-1369`), external-source-ready.
- **ContactSource + rawSnapshot** - built in schema (`schema:199-221`). Whether the DB window ran against prod Neon is unverified from the repo.
- **Ingestion pipeline** - PARTIAL. `normalize.ts`, transforms, `resolveContact`/`resolveBatch`, identity precedence (email > phone > instagram) all exist. But `planPersist`/`executePersist` were NEVER written, and there is exactly ONE dry-run CSV preview route, not four. The pipeline cannot persist a contact today.
- **MemberEngagementEvent** - built (`schema:1601-1645`), append-only. Current enum values (verbatim): `rsvp_confirmed, rsvp_cancelled, checked_in, waitlist_joined, waitlist_promoted, application_submitted, newsletter_opened, sponsor_perk_clicked, guest_created, application_approved, application_rejected, comp_issued, access_requested, ticket_purchased, plus_one_added, referral_made, enrichment_synced, merged`.
- **SMS storage** - PARTIAL. `SmsConversation`/`SmsMessage` (`schema:1566-1600`) are phone-keyed per workspace with NO Member FK (House Phone only). `Blast`/`BlastRecipient` (`schema:2106-2156`) exist with `consentSource`/`providerId`. `ClosedContact` (`schema:2157`) is a per-workspace blocklist. Transactional email (Resend) is logged nowhere.
- **Application data** - built. `QuestionDefinition`, `ApplicationAnswer`, scoring writes archetype/dimension scores onto Application. `MemberPsychographics` is the member-level mirror but only fills via a one-off manual script - NO live sync on approval.
- **pgvector** - installed, DAM only. `Asset.embedding vector(768)`, HNSW index. No application-answer embeddings.

Confirmed NOT BUILT (the substrate gaps this spec fills):
- Tasks / follow-ups - no model of any kind.
- ChannelSubscription / SuppressionEntry - the channel consent floor. Designed in Appendix A of the AC spec (reproduced in Section 1), never built.
- Durable Segment / Audience model - the "lists" API is the WatchList, not segments.
- Unified comms timeline - the record timeline renders engagement events only; SMS not linked to Member; email unlogged.
- Consent unification - consent lives in TWO places that don't sync (Application: `agreedToMembershipTerms/emailOptIn/smsOptInAt`; Member: `marketingEmailOptIn/marketingSmsOptIn`).

---

## 1. Phase 1 - Consent floor (the gate on all sending)

**Why first:** No Bad Blast and every lifecycle message legally cannot send without this. It is the hard prerequisite. It also unifies consent, which is currently split across Application and Member with no single read.

**Build the Appendix A schema exactly as designed** (it is good, do not redesign). Reproduced from `NoBadOS__spec__activecampaign-import-and-suppression-corrected__2026-06-18.md`:

```prisma
enum CommChannel { EMAIL SMS }
enum SubscriptionStatus { SUBSCRIBED UNSUBSCRIBED PENDING CLEANED NEVER_SUBSCRIBED }
enum ConsentBasis { EXPRESS_OPTIN IMPLIED_RELATIONSHIP IMPORTED_LEGACY OPERATOR_ADDED UNKNOWN }
enum SuppressionReason { UNSUBSCRIBE HARD_BOUNCE SPAM_COMPLAINT CARRIER_REJECT MANUAL_BLOCK GLOBAL_EXCLUDE INVALID }

model ChannelSubscription {
  id           String   @id @default(cuid())
  workspaceId  String
  memberId     String
  channel      CommChannel
  stream       String   @default("*")
  status       SubscriptionStatus @default(PENDING)
  consentBasis ConsentBasis @default(UNKNOWN)
  consentText  String?
  consentSource String?
  consentIp    String?
  consentAt    DateTime?
  externalId   String?
  source       ContactSourceSystem?
  syncedAt     DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  member       Member    @relation(fields: [memberId], references: [id], onDelete: Cascade)
  workspace    Workspace @relation(fields: [workspaceId], references: [id])
  @@unique([workspaceId, memberId, channel, stream])
  @@index([workspaceId])
  @@index([memberId])
  @@index([workspaceId, channel, status])
}

model SuppressionEntry {
  id          String   @id @default(cuid())
  workspaceId String
  channel     CommChannel
  identifier  String
  reason      SuppressionReason
  source      String?
  memberId    String?
  note        String?
  createdAt   DateTime @default(now())
  member      Member?   @relation(fields: [memberId], references: [id], onDelete: SetNull)
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  @@unique([workspaceId, channel, identifier])
  @@index([workspaceId, channel])
  @@index([memberId])
}
```

**The one canonical send-decision function** (from Appendix A, locked, this is the only path any send goes through):

```
canSend(member, channel):
  if SuppressionEntry exists for (workspace, channel, identifier(member, channel)): return false   # hard floor
  sub = ChannelSubscription for (workspace, member, channel, "*")
  return sub != null and sub.status == SUBSCRIBED
```

Build this as `lib/comms/can-send.ts`. Every message send in the platform (Blast, lifecycle, transactional-marketing) routes through it. No send path may query subscription state directly and skip the suppression floor.

**Consent unification (the reconciliation the audit surfaced):** Application consent (`agreedToMembershipTerms/emailOptIn/smsOptInAt`) and Member marketing booleans (`marketingEmailOptIn/marketingSmsOptIn`) become INPUTS that write ChannelSubscription rows, not competing sources of truth. On member creation/approval and on import, derive ChannelSubscription from whichever consent signals exist, stamping `consentBasis` (EXPRESS_OPTIN for form opt-in, IMPLIED_RELATIONSHIP for event-attendance consent, IMPORTED_LEGACY for CSV imports without explicit per-contact opt-in, OPERATOR_ADDED for manual). After this, ChannelSubscription is the single read for "may we message this person on this channel," and the two legacy consent locations become historical inputs. Do NOT drop the legacy columns (additive law); just stop reading them for send decisions.

**Naming-collision guard (locked law):** ActiveCampaign "Red List" = VIP = WatchList PURPLE. It must NEVER map to `Member.redListed`, the RedList model, or a SuppressionEntry. Any tag-to-suppression mapping ships with a server-side validator enforcing this. The ACCESS axis (redListed/RedList/WatchList - can this person enter) and the CHANNEL axis (SuppressionEntry/ChannelSubscription - may we message this identifier) are orthogonal and must never be conflated.

**Enum additions (MemberEngagementEvent):** `channel_subscribed`, `channel_unsubscribed`, `suppression_added`. Via standalone `ALTER TYPE ... ADD VALUE`, never db push.

**Consent visibility on the record:** the person 360 page gains a Consent panel showing per-channel status (SUBSCRIBED/UNSUBSCRIBED/etc.), basis, and source. Read-only display in this phase; the action layer (Section 5) makes it actionable.

---

## 2. Phase 2 - Ingestion completion (get the lists in)

**Why second:** the substrate is empty without contacts. Your four lists (ActiveCampaign, Beehiiv, Luma, phone) must land as unified person records WITH per-contact consent provenance. The audit found the pipeline can preview a CSV but cannot persist. This phase writes the missing half.

**Build `planPersist` and `executePersist`** (`lib/connectors/ingest/`), completing the pipeline: `source -> normalize -> resolveBatch -> planPersist -> executePersist`. `planPersist` produces a reviewable plan (create / auto-attach / needs-review) using the existing identity precedence (email_exact = strong auto-attach; phone/instagram = soft, review only). `executePersist` commits the plan: upserts Member, writes ContactSource with full `rawSnapshot`, and CRITICALLY writes ChannelSubscription rows carrying consent provenance per contact.

**Consent provenance at import (non-negotiable, this is the whole point):** every imported contact gets a ChannelSubscription per channel with an honest `consentBasis`. Event-attendee lists where attendees agreed to all communication -> `IMPLIED_RELATIONSHIP` or `EXPRESS_OPTIN` depending on capture. Raw CSV with no per-contact opt-in record -> `IMPORTED_LEGACY` (sendable only if operator affirms a lawful basis; flag these distinctly). The importer must let the operator declare the consent basis for a given import batch, and stamp it per row. "Everyone agreed at events" becomes a per-contact, timestamped, provable record, not a blanket assumption.

**Turn the dry-run preview into a real persisting import route.** Extend the existing preview route (`app/api/operator/crm/import/preview/route.ts`) with a commit route that runs `executePersist`. Preview stays a required step (operator reviews the plan before commit).

**Four source adapters:** ActiveCampaign (connector code exists: `lib/connectors/activecampaign/`), Beehiiv (connector exists), Luma (CSV), phone contacts (CSV/vCard). All normalize into the existing `NormalizedContact` shape. Carry each source's opt-in/consent field into the ConsentBasis mapping.

**Merge / identity-review queue (Section B8 gap):** build the resolution UI the preview client lacks. Soft-match cases (`REVIEW` from `resolveBatch`) land in a queue where an operator confirms/rejects a merge. Reuse `lib/member-merge.ts` and `Member.mergedIntoId/At`. Without this, imports silently corrupt the person graph over time.

**Enum additions:** `contact_imported`, `contact_merged` (distinct from existing `merged`, which is member-merge; or reuse `merged` if semantics match - build agent decides and reports).

---

## 3. Phase 3 - Durable segments (the audience object)

**Why third:** No Bad Blast targets segments, not name lists. The AI query layer produces segments. The roster filters into segments. Currently no such object exists. This is the connective tissue between the data and every action.

**New model:**

```prisma
model Segment {
  id           String   @id @default(cuid())
  workspaceId  String
  name         String
  description  String?
  definition   Json                       // the filter/query AST (structured, not raw SQL)
  kind         SegmentKind @default(DYNAMIC)   // DYNAMIC = re-evaluated on read; STATIC = frozen membership snapshot
  createdBy    String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  lastEvaluatedAt DateTime?
  cachedCount  Int?
  workspace    Workspace @relation(fields: [workspaceId], references: [id])
  @@index([workspaceId])
}
```

`definition` is a structured filter AST (the same primitive vocabulary the future semantic query layer will emit): filter by field, tag, lifecycle status, event attendance count, consent state, archetype, date ranges, etc. NOT raw SQL. A `lib/segments/evaluate.ts` resolves a Segment definition to a set of memberIds, workspace-scoped, with the workspaceId hard-injected server-side and never definition-suppliable. DYNAMIC segments re-evaluate on read (always current); STATIC segments freeze a membership snapshot (for "the people who were in this segment when I blasted").

**Segments are the target of actions:** blast it, tag it, add to an event, export it, change lifecycle in bulk. This phase builds the model + evaluator + a basic segment-builder UI (roster filters that save as a Segment). The Blast/action wiring comes with those features; this phase makes the object exist and be evaluable.

**Distinct from SavedReport** (`schema:1016`), which is a saved intelligence query (metricIds + filters for the dashboard). A Segment is a reusable audience of people. Do not conflate; they may later share filter-AST primitives.

---

## 4. Phase 4 - Unified comms timeline (the keystone) - GATED

**Why gated:** this is where the four platform-shape decisions become load-bearing, specifically the message system-of-record (does NoBC OS become the store and Railway/House Phone relay in, or does House Phone stay master and NoBC mirror). **This phase does not start until that decision is made.** Building the unified Message model before deciding system-of-record means building it twice.

Scope, pending that decision:

**A unified Message + Conversation model** that links ALL channels to one Member and renders one chronological thread on the record:
- Both Twilio numbers (844 blast, 737 House Phone) stitched to one person via E.164 -> Member.phone.
- Email (Resend) sends logged (currently logged nowhere).
- iMessage Blast outbound logged one-way (matched by phone; inbound iMessage explicitly OUT of scope - Adam's personal texts stay out).
- Idempotent ingestion via provider message IDs (MessageSid etc.).
- The existing `SmsConversation`/`SmsMessage` (House-Phone-only, no Member FK) either migrates into or feeds the unified model - the build agent proposes the migration path in Phase 1 investigation of the Blast spec, not here.

**Enum additions (planned, from the AC spec):** `sms_sent`, `sms_delivered`, `sms_read`, plus inbound message events. Enumerated fully in the Blast spec.

**The comms timeline renders on the record:** the person 360 page's timeline (currently engagement-events-only) gains message rows with channel badges, showing one unified conversation story across all channels.

**This phase is specified here for completeness and dependency-ordering, but its build is owned by the No Bad Blast / comms spec**, because system-of-record, inbound routing (the 844/737 collision), and Twilio Conversations-vs-Programmable-Messaging are Blast-layer decisions. Listed here so the substrate spec's dependency graph is honest: segments and consent (Phases 1-3) do NOT depend on this; Blast and lifecycle automation DO.

---

## 5. Phase 5 - Tasks + the insight-to-action seam

**Why last in substrate (but before the intelligence layer):** the proactive insight engine generates "intro these two / this member's at-risk / chase this sponsor" into a void unless there is a Task object for those to become. Tasks are also immediately useful manually (follow-ups, "Chloe to intro A and B by Thursday").

**New model, built with the source seam from day one so build 2 (InsightRecord lifecycle) plugs in without reshaping it:**

```prisma
enum TaskStatus { OPEN DONE DISMISSED }
enum TaskSourceType { MANUAL INSIGHT }

model Task {
  id          String   @id @default(cuid())
  workspaceId String
  title       String
  body        String?
  assigneeId  String?              // operator (Adam / Chloe)
  dueDate     DateTime?
  status      TaskStatus @default(OPEN)
  entityType  String?              // polymorphic, reuse OperatorComment pattern
  entityId    String?
  sourceType  TaskSourceType @default(MANUAL)   // the seam
  sourceId    String?              // null now; = InsightRecord.id when the intelligence layer ships
  createdBy   String
  createdAt   DateTime @default(now())
  completedAt DateTime?
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  @@index([workspaceId, status])
  @@index([workspaceId, assigneeId, status])
  @@index([entityType, entityId])
}
```

The `sourceType`/`sourceId` pair is the whole seam. Today every task is `MANUAL`. When the intelligence layer's InsightRecord ships, an accepted insight creates a Task stamped `sourceType=INSIGHT, sourceId=<insightId>`. Task's schema never changes. The insight-to-action loop (insight -> task -> action -> outcome feeds back as signal) closes without a rebuild.

**Enum additions:** `task_created`, `task_completed` on MemberEngagementEvent so tasks show on the person timeline.

**UI:** tasks render on the person record (a Tasks panel) and in a per-operator task list. Lightweight. Create, assign, due-date, complete, dismiss.

---

## 6. What this substrate explicitly does NOT build (and which spec owns each)

- **AI I/O layer** (NL-in structured ingestion, NL-out semantic query, insight generation, reports) - owns: the AI-first CRM / intelligence spec. Consumes: segments, the person graph, embeddings.
- **Application-answer embeddings** (pgvector over answers for semantic search) - owns: the intelligence spec. This substrate leaves pgvector DAM-only; the intelligence layer adds an `ApplicationAnswerEmbedding` model.
- **No Bad Blast send UI + the automated lifecycle flows** - owns: the Blast / comms-automation spec (built on your research doc's cadence tables). Consumes: consent floor, segments, unified Message model, the async automation reactor.
- **The rules-engine template library + enablement + dry-run simulation** - owns: the rules-engine / enablement spec. Note the locked boundary (Section 8).
- **Tenur MCP federation** - owns: a Tenur integration spec. Design the seam when that spec is written; do not block substrate on it.
- **Membership billing / recurring enrollment** (the §7 gap: MembershipEnrollment, Stripe Subscription, dunning) - owns: a bounded billing spec. Noted, not built here.
- **MemberPsychographics live sync** (archetype scores are on Application but only mirror to member level via a manual script) - small, but flag: the intelligence layer needs a sync-on-approval step, not a one-off backfill. Owns: the intelligence spec, or a tiny standalone fix.

---

## 7. Build sequence + dependencies

```
Phase 1  Consent floor (ChannelSubscription, SuppressionEntry, canSend, consent unification)
             |
             v
Phase 2  Ingestion completion (planPersist/executePersist, 4 adapters, merge queue, consent provenance)
             |     (Phase 2 depends on Phase 1: import writes ChannelSubscription rows)
             v
Phase 3  Durable segments (Segment model, evaluator, segment-builder UI)
             |     (Phase 3 depends on Phase 2: segments filter over real imported people + consent state)
             v
Phase 5  Tasks + source seam   <-- can build in parallel with Phase 3; depends only on the person record (exists)

Phase 4  Unified comms timeline  <-- GATED on the message system-of-record decision.
                                     Does NOT block Phases 1-3-5. Owned by the Blast spec.
```

**Critical path to "market July 11 legitimately":** Phase 1 (consent) + Phase 2 (get the list in) + a minimal manual email send. Phase 3 (segments) makes the send target-able; a first blast could hardcode "everyone with EMAIL SUBSCRIBED" before segments land if speed demands, but segments are the right primitive.

**One writer per repo at a time.** These phases are sequential for a reason; do not run two as parallel writers.

---

## 8. Locked architectural boundary (from event-automation-layer spec)

This substrate must respect the platform's existing, LOCKED separation. Do not blur it:

- **The rules engine = synchronous decision-maker.** Allow / deny / which-price-tier. In the critical path. Deterministic. Returns in milliseconds. This is the access gate engine. It FAILS CLOSED.
- **The event / automation layer = asynchronous reactor.** AFTER a decision or state change: send a confirmation, sync AC, recompute a score. Side effects and choreography. It FAILS SAFE (a lost reaction degrades gracefully; a re-triggerable email).
- **The load-bearing rule: the automation layer NEVER makes an access decision.** No Bad Blast's automated flows live in the async reactor, NOT the gate engine. They share a trigger -> condition -> action shape but are separate layers with opposite failure modes. A build agent must never collapse them into one evaluator.

`canSend` (Section 1) is a synchronous guard called by send paths; it is a channel-consent check, not an access decision, and lives in the comms layer, not the gate engine.

---

## 9. Schema-safety law (restate, non-negotiable)

- `prisma db push` is BANNED. It would DROP out-of-band objects: `Asset_searchVector_idx` (GIN + trigger), `sponsor_audience_member` VIEW, `Asset_embedding_hnsw_idx` (HNSW).
- Prisma binary: `node node_modules/prisma/build/index.js`. NEVER `npx prisma`.
- Additive flow only: edit schema -> `prisma generate` -> `migrate diff` to review the SQL -> refuse any DROP/ALTER of an existing table -> Adam runs `prisma db execute` on Neon prod himself. The build agent NEVER runs a prod DB write; it emits the SQL for Adam to run.
- All new models are additive. All enum extensions via standalone `ALTER TYPE ... ADD VALUE`.
- Back-relations on Member/Workspace for the new models are Prisma relation fields only; verify the generated migration touches only new tables + relation fields, zero DROP.

---

## 10. Brand + copy rules

- "NoBC" never "NBC". No em dashes (spaced hyphens only). "Access" not "RSVP" in user-facing copy (internal `rsvpId` unchanged). No raw hex (design tokens only). Never expose raw enum values in UI copy.
- Constitution: "if it doesn't serve the member, it doesn't exist." Same data point is matchmaking if the member feels the payoff, data mining if they don't.
- Archetypes/natures NEVER sponsor-facing. Sponsor output = firmographic only. `MemberPsychographics` is firewalled from sponsor surfaces (physically cannot join `sponsor_audience_member`); keep it that way.

---

## 11. Open decisions for Adam

1. **Phase 4 system-of-record.** Does NoBC OS become the message store of record with Railway/House Phone relaying in, or does House Phone stay master and NoBC mirror? Phase 4 is gated on this. (Claude's lean: NoBC OS as store of record, Railway relays, so the unified thread lives in one place.) NOT required to start Phases 1-3-5.
2. **IMPORTED_LEGACY sendability.** For CSV imports with no per-contact opt-in record, what is the default? Suppress until an operator affirms lawful basis, or send under an operator-declared batch basis? (Claude's lean: import as PENDING/legacy, require operator to affirm basis per batch before those contacts are sendable.)
3. **Merge queue autonomy.** Should strong email_exact matches auto-merge on import silently, or always surface for confirmation? (Audit says email_exact is already "strong auto-attach"; confirm that stays automatic and only soft matches queue.)
4. **First-blast shortcut.** For July 11 speed: build Phase 3 segments before the first blast, or allow a one-time hardcoded "everyone EMAIL SUBSCRIBED" send after Phase 1-2 and add segments right after? (Claude's lean: segments are cheap enough to do first; avoid the throwaway.)
5. **MemberPsychographics sync.** Fix the archetype member-level sync (sync-on-approval) as a tiny standalone task now, or defer to the intelligence spec? It affects whether segments can filter by archetype at read time.

---

## 12. Handoff note to the build agent

Build phases in order (1 -> 2 -> 3, with 5 parallel to 3; 4 gated and deferred). Each phase: plan-first, investigate the exact files, emit additive schema + the SQL for Adam to run, then implement, then a structured report (files touched with line ranges, enum additions, the SQL handed over, `git show -s --format='%H %s'`). Reuse everything in Section 0 marked built. Do not rebuild the person record, notes, tags, ingestion normalize/resolve, or the referral spine. Respect Section 8's boundary and Section 9's schema law without exception.
