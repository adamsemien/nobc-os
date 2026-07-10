# NoBC OS - ActiveCampaign Import & Suppression (Corrected Spec)

**Date:** 2026-06-18
**Status:** Authoritative. Supersedes `NoBadOS__spec__activecampaign-import-mapping-and-selection__2026-06-17.md`, which predated the read of the actual adapter code.
**Basis:** Three read-only audits of committed `main` @ `2165351` plus the `feature/crm-ingest-persist` branch. Where this spec and any prior narrative disagree, this spec wins, because it is written against what the code actually does.

---

## 0. Ground truth - what the code does today

### The import pipeline (feature/crm-ingest-persist)
`source -> transform -> NormalizedContact -> resolveBatch -> planPersist -> executePersist`, shared by all four import routes (`crm/import/{commit,activecampaign,beehiiv,producer}`) via `ingestNormalizedContacts()`.

The persist layer is the bottleneck. `NewMemberFields` carries only **six** semantic fields: email, firstName, lastName, phone, roles, tags. Anything richer never reaches a Member column - it survives only inside `ContactSource.rawSnapshot` (JSONB).

What it does on a write:
- email / firstName / lastName / phone -> real Member columns (+ per-field provenance).
- instagram -> used as a **match key only, then dropped** (not written to `Member.instagram`, even though that column exists).
- roleHint -> `Member.roles[]` (AC = always `subscriber`; CSV = none).
- tags -> `Member.tags String[]` (the denormalized array). **No `Tag` / `EntityTag` rows created.**
- externalId -> `ContactSource.externalId` (the per-source dedupe key).
- full source record -> `ContactSource.rawSnapshot`.
- on create: synthetic `clerkUserId = import:<source>:<uuid>`, `status = GUEST` (hardcoded), `memberQrCode` generated.
- per run: one run-level `AuditEvent` (`crm.import.committed`). **No per-member `MemberEngagementEvent` emitted.**
- `Member.redListed`: never touched.
- company / industry / city / country / companyDomain / linkedinUrl / AC custom fields: **dropped** to rawSnapshot only. `Member.customFields` is not written by ingest at all.

### AC route specifics
- Pulls `client.fetchAllContacts()` - **contacts only, the entire account (~6,705), offset-paged.**
- Does **not** pull AC tags, lists, or custom fields ("no custom-field mining is needed").
- Maps email / phone / first / last -> columns; AC id -> ContactSource.externalId; cdate/udate -> enrichment (dropped at persist); full contact -> rawSnapshot.

### Match / dedupe chain (identity.ts)
Precedence **email > phone > instagram**, mirroring `member-merge.ts`.
- `email_exact` = STRONG -> auto-attach (match).
- phone / instagram = SOFT -> review only, never auto-merged.
- email matches one contact but a soft key points elsewhere -> review (conflicting_identity).
- soft key matches multiple -> review (ambiguous); one -> review (soft_match).
- no keys -> create (identity-less); no email -> create deferred (`no_email`, because Member.email is required + unique).

### Suppression awareness
**None.** `executePersist` mints `GUEST` members unconditionally and never reads any block flag. A previously-blocked person re-imported is silently (re)created or attached as a sendable GUEST.

---

## 1. Rule #1 - the naming-collision law (server-validated, non-negotiable)

| Concept | NoBC OS mechanism | Meaning |
| --- | --- | --- |
| VIP / elevate | `WatchList` type **PURPLE** | operator-curated allowlist; surfaced at the door |
| Hard block | `Member.redListed`, `RedList` model, `WatchList` type **BLOCKED** | silently kills apply + RSVP |

ActiveCampaign uses the words the opposite way: its **"Red List" tag is the VIP tier** (the ~122 we send to).

**Therefore: AC "Red List" / Purple-VIP tags map to `WatchList` PURPLE. They MUST NOT map to `Member.redListed` or `RedList`.** A mapping that sends AC "Red List" into `redListed` would suppress the top tier. Any tag-to-suppression mapping ships with a validator that refuses to write `redListed`/`RedList`/`WatchList BLOCKED` from a tag whose semantics are VIP.

Actual suppression from AC = `Events: DO NOT INVITE` (6), `Please exclude me from all event invites` (3), and hard bounces -> the BLOCK side. Per-event `Exclude from: <event>` tags stay soft and deferred (not channel-global).

---

## 2. Two suppression axes - do not conflate them

NoBC OS already has an **ACCESS axis** and is missing a **CHANNEL axis**. They are orthogonal. A PURPLE VIP can still be email-unsubscribed.

- **ACCESS axis (exists):** can this person apply / RSVP / enter? Governed by `redListed` / `RedList` / `WatchList`. PURPLE elevates, the rest block.
- **CHANNEL axis (to build):** may we message this identifier on this channel? Governed by two new additive models:
  - `SuppressionEntry` - the hard send floor (unsubscribe / bounce / complaint / carrier reject), keyed by `(workspaceId, channel, identifier)`, survives member deletion and re-import.
  - `ChannelSubscription` - the positive per-channel opt-in state and sync record.

`SuppressionEntry` is **not** a fourth access list. It is the missing channel floor. Send decision order = suppression floor first (hard block), then subscription status. See Appendix A for the Prisma.

---

## 3. Which AC contacts to import - audience scoping + realtor firewall

The branch's `fetchAllContacts()` is wrong for NoBC: it pulls the realtor book and the Entire Database cruft.

- **Import the NoBC slice only:** the **Network + Industry Partner + Sphere** lists (816 unique contacts). Replace `fetchAllContacts()` with list-scoped pulls (fetch by AC list id, union, dedupe).
- **Realtor firewall (deny-by-default):** never import the Realtors list, the ~40 realtor-namespaced tags (`Send deals about:*`, `Closed Won*`, presentations), or `Interest: Presentation Real Estate Secrets`. Unlisted = not imported.
- This is a subject-matter firewall, not a method firewall. Chloe's collection method (color tiering, namespaced segmentation, her survey design) is the asset we carry forward; only the realtor audience is walled off.

---

## 4. Field mapping (corrected, source -> target)

Identity (adapter already correct): email / firstName / lastName / phone -> Member columns + provenance.

Fixes and additions:

| AC source | Target | Phase | Note |
| --- | --- | --- | --- |
| instagram | `Member.instagram` column | 2 | adapter currently drops it; also keep as match key |
| company / companyName | `Member.companyName`, domain -> `companyDomain` | 2 | adapter drops to rawSnapshot today |
| industry / jobFunction / seniority / companySize / ageRange / householdIncome / city / country / linkedinUrl | matching Member columns | 2 | dense AC fields land in real columns, not customFields |
| AC tags | `Tag` (externalSource=`activecampaign`, externalId=AC tag id) + `EntityTag(member)` | 2 | adapter dumps to `Member.tags` array today; upgrade to structured Tag. `@@unique([workspaceId, externalSource, externalId])` is purpose-built for this |
| `Interest:*` tags | Tag (enrichment), with per-tag exceptions | 2 | exclude realtor strays inside the `Interest:` namespace (e.g. Investor Emails - confirm with Chloe) |
| `Attendees:*` / `Ticket Purchasers:*` | event-attendance history (flat tags for now) | 2 | flat list now; backfilling Event rows is deferred |
| `Vendors*` | `roles += vendor` (+ event tag) | 2 | |
| `Sponsors*` | `roles += sponsor_contact` (+ SeriesSponsor link later) | 2 | |
| `Sponsor: $1500/$2500/...` | sponsor-prospect customField / Tag | 2 | brand aggregation deferred - no person-to-company entity exists |
| `Red List` / Purple VIP tag | `WatchList` PURPLE | 2 | **never** redListed - Rule #1 |
| DO NOT INVITE / Please exclude / hard bounce | BLOCK side (redListed/RedList) + `SuppressionEntry` | 2/3 | |
| Realtor-namespaced tags | firewall - never imported | - | |
| Last Engaged / opens | `MemberEngagementEvent` (`newsletter_opened` exists; carry `occurredAt`) | 2 | adapter emits none today |
| thin/empty psychographics (musicians, lifestyle, spend bands, influence, dream collab) | `MemberPsychographics` / customFields | deferred | mostly empty in AC anyway; the real source is the apply/enrichment flow going forward |

Roles default: AC contacts -> `subscriber` (adapter does this); layer `vendor` / `sponsor_contact` from tags in phase 2.

---

## 5. Suppression-before-import guard (must ship in Phase 1)

`executePersist` must check existing block state before minting a sendable GUEST:
- If incoming email matches `RedList`, an existing `Member.redListed = true`, or `WatchList` BLOCKED -> create with `redListed = true` (or route to review), never as a clean sendable GUEST.
- Re-import never clears an existing block (already true - it does not touch redListed; make it explicit and tested).

This is the minimum safety addition. Full send-time channel suppression arrives with `SuppressionEntry` in Phase 3.

---

## 6. Build sequence (ordered; DAM repo-gate noted)

**Phase 0 - now, no repo write (DONE / in hand):** this spec; the `ChannelSubscription` + `SuppressionEntry` additive schema (Appendix A); the `SyncRule` design deferred to Phase 4.

**Phase 1 - safe lossless import (first writing work, gated on DAM freeing the repo):**
1. Re-apply `feature/crm-ingest-persist` onto current main - it is stale (behind main), so this is a cherry-pick/re-apply of the 4 endpoints + adapter, not a fast-forward merge.
2. Add the suppression-before-import guard (Section 5).
3. Change the AC pull from `fetchAllContacts()` to list-scoped (Network / Industry Partner / Sphere) + realtor firewall.
4. Run import: identity -> columns, everything else preserved in `rawSnapshot`, `GUEST`, **no sends**. Idempotent via ContactSource externalId.

**Phase 2 - enrich from rawSnapshot (no AC re-pull):**
5. Backfill rich Member columns from `rawSnapshot` (company / industry / city / instagram / etc.).
6. Pull AC tags + contact-tag links + custom fields; map -> `Tag` / `EntityTag`; apply role layering; `Red List` -> `WatchList` PURPLE; block tags -> suppression.
7. Emit `MemberEngagementEvent` for AC engagement (add enum values via standalone `ALTER TYPE ... ADD VALUE` on the direct URL - never `db push`).

**Phase 3 - channel consent layer (additive schema):**
8. Add `ChannelSubscription` + `SuppressionEntry` (additive migration; see schema-safety note).
9. Wire send-time suppression - the actual send floor that all outbound (Resend / beehiiv / Blast / House Phone) consults.

**Phase 4 - ongoing sync + Blast:**
10. `SyncRule` operator-controlled allowlist (the membrane) if/when bidirectional AC sync is wanted.
11. No Bad Blast SMS events -> `MemberEngagementEvent` via the ingest endpoint contract (matched E.164 -> Member.phone; opt-outs -> SuppressionEntry channel=SMS). Requires new enum values `sms_sent` / `sms_delivered` / `sms_read`.

---

## 7. SMS reality (carry forward)

There is no clean SMS-consent source in AC. There is no SMS list; the "AC Migration" tag (~2,700) is migration cruft, not consent. Phone is present on ~82% of the NoBC slice, but presence is not consent. SMS consent must come from the apply-form `consentSms` boolean or a fresh opt-in. Do not treat imported phone numbers as sendable on SMS.

---

## 8. Reuse, do not rebuild

- `Tag` + `EntityTag` already exist and are connector-ready. The earlier "build Tag / MemberTag" plan is dead.
- `MemberEngagementEvent` (18 types) is the activity log. The earlier "build a new activity/event-log model" plan is dead - extend the enum instead.
- The sponsor firewall is a DB `VIEW` (`sponsor_audience_member`). Do not re-implement in app code.

---

## 9. Schema-safety (permanent)

`prisma db push` is banned. Two out-of-band DB objects would be dropped by it:
1. `Asset_searchVector_idx` GIN index + trigger + function (DAM full-text search).
2. `sponsor_audience_member` VIEW (the DB-enforced sponsor firewall).

Additive flow only: edit schema -> `prisma generate` -> `migrate diff` (review SQL; refuse any DROP / ALTER TYPE on existing tables / RENAME) -> Adam runs `prisma db execute --file` on Neon (prod branch). `additive_contact_spine.sql` is the clean additive template. Use `node node_modules/prisma/build/index.js`, not `npx`.

---

## 10. Open items (non-blocking for Phase 1)

- **Blue tier** - WatchListType only has PURPLE and BLOCKED, so Blue is a Tag/segment, not a WatchList type. Confirm with Chloe what it means.
- **`Interest: Investor Emails` (490)** - NoBC interest or realtor stray? Ask Chloe; firewall if realtor.
- **Event-history modeling** - flat attendance tags now vs backfilling real Event rows. Leaning flat for Phase 2.

---

## Appendix A - additive channel-consent schema (Phase 3)

New, additive, workspace-scoped. The CHANNEL axis (Section 2), orthogonal to the access lists.

```prisma
enum CommChannel { EMAIL SMS }

enum SubscriptionStatus { SUBSCRIBED UNSUBSCRIBED PENDING CLEANED NEVER_SUBSCRIBED }

enum ConsentBasis { EXPRESS_OPTIN IMPLIED_RELATIONSHIP IMPORTED_LEGACY OPERATOR_ADDED UNKNOWN }

enum SuppressionReason { UNSUBSCRIBE HARD_BOUNCE SPAM_COMPLAINT CARRIER_REJECT MANUAL_BLOCK GLOBAL_EXCLUDE INVALID }

/// Per-channel opt-in state + sync record. Created on signal, not pre-exploded per member x channel.
model ChannelSubscription {
  id           String   @id @default(cuid())
  workspaceId  String
  memberId     String
  channel      CommChannel
  stream       String   @default("*")        // "*" = all of channel; else a named stream. Non-null (NULL-distinct unique gotcha).
  status       SubscriptionStatus @default(PENDING)
  consentBasis ConsentBasis @default(UNKNOWN)
  consentText  String?                        // snapshot of the exact opt-in language
  consentSource String?                       // e.g. apply_form, activecampaign, operator
  consentIp    String?
  consentAt    DateTime?
  externalId   String?                        // source-system subscription id
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

/// Immutable, identifier-keyed hard floor. Survives member deletion and re-import.
model SuppressionEntry {
  id          String   @id @default(cuid())
  workspaceId String
  channel     CommChannel
  identifier  String                          // normalized email or E.164 phone
  reason      SuppressionReason
  source      String?                         // who/what created it
  memberId    String?                         // best-effort link; SetNull so it survives deletion
  note        String?
  createdAt   DateTime @default(now())

  member      Member?   @relation(fields: [memberId], references: [id], onDelete: SetNull)
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  @@unique([workspaceId, channel, identifier])
  @@index([workspaceId, channel])
  @@index([memberId])
}
```

Back-relations on `Member` and `Workspace` are schema-only additions (no SQL against those tables beyond Prisma's relation handling - verify the generated migration touches only the new tables + relation fields, zero DROP). Send-decision pseudocode:

```
canSend(member, channel):
  if SuppressionEntry exists for (workspace, channel, identifier(member, channel)): return false   # hard floor
  sub = ChannelSubscription for (workspace, member, channel, "*")
  return sub != null and sub.status == SUBSCRIBED
```
