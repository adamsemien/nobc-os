# Operator CRM — Program Roadmap (for review)

_Planning doc only. No code in this file. Takes the member CRM from today's read-only record (Slice 1) to an operator workspace Adam runs the room from. Situates `SLICE-2-PLAN.md` inside the larger program and specs four new capabilities as sequenced, shippable slices. Grounded read-only in the current schema + surfaces. Author: away-session. Status: **draft — ordering & product choices are OPEN for Adam, not locked.**_

---

## 1. The arc

Slice 1 shipped the **read** record (identity, timeline, provenance). Slice 2 (`SLICE-2-PLAN.md`) makes a record **editable** (F4 inline edit) and lets Adam define fields in his own vocabulary (F5). This roadmap is everything after that turns a record viewer into an **operating surface** — the place Adam captures who he met, sees how the room connects, acts on a person, and builds a guest list.

Adam's four capabilities:

| Capability | One-liner | Net-new vs. Slice 2 |
|---|---|---|
| **Capture** | Quick-add someone met in the wild; accumulate notes / a running read | Mostly **exists** — quick-add route + `OperatorComment` + Slice 2 |
| **Relationships** | Member-to-member links (brought / referred / vouched / close); the room is a graph | **New** — needs a relationship table |
| **Act** | Operator actions from a record (invite, comp, sponsor-intro flag, add to list, text) | **Orchestration** over existing write paths |
| **Curate** | Lists / segments + a filterable roster to build a guest list | **New or tag-backed** — depends on the list/segment model decision |

---

## 2. Where Slice 2 sits

`SLICE-2-PLAN.md` is the **Capture foundation** and a hard dependency for the rest:

- **F4 inline edit** — the write affordance every later capability reuses (the `EditableField` primitive, the optimistic `usePatchMemberFields` path).
- **F5 `FieldDefinition`** — Adam's custom vocabulary. "Custom fields in Adam's own words" (a Capture requirement) *is* F5; this roadmap does not re-spec it.

So: **Slice 2 ships first.** Capture's remaining gap (minimal-field quick-add + notes surfacing) is small and sits right behind it. Relationships / Act / Curate build on the Slice-2 edit primitives but are otherwise independent program tracks.

---

## 3. Grounding — what exists today (confirmed read-only)

| Primitive | Model / surface | State | Which capability it serves |
|---|---|---|---|
| Manual member create | `POST /api/operator/members/create` (STAFF+, synthetic `manual:<uuid>`, mints QR, emits `member.created`); `AddMemberDrawer.tsx` | **Built.** Requires firstName + lastName + **email** (the `@@unique([workspaceId, email])` identity key) | Capture (quick-add) |
| Canonical identity | `resolveMember` (`lib/member-identity.ts`) — find-or-create GUEST, `guest:`/`applicant:` synthetic ids, QR law | **Built.** The one place a Member is born in the funnel | Capture |
| Operator notes | `model OperatorComment` (entityType/entityId, body, mentions, soft-delete); `CommentThread` already on the record page | **Built** | Capture (running read) |
| Inline edit + custom fields | Slice 2 F4/F5 (PATCH path, `FieldDefinition`) | **Planned** (`SLICE-2-PLAN.md`) | Capture |
| Referral edge (single) | `Member.referredByMemberId` self-relation `"MemberReferrals"` + `networkCapitalScore`; `Application.referredBy` (free text) | **Built but thin** — one untyped FK, no graph | Relationships |
| Typed member↔member graph | — | **Does not exist** | Relationships (needs new table) |
| Event access / invite | `RSVP` (`origin`, `status`, `isComp`, `compType`, `guestEmail/Name`), `AccessToken`, `Event.eventAccess` JSON (member/guest/comp gates), operator RSVP routes | **Built** | Act (invite, comp) |
| Comp | `RSVP.isComp` + `compType` + `comp_issued` engagement event | **Built** | Act (comp) |
| Tagging | `Tag` (name/slug/category/color/externalSource) + `EntityTag` (`TagEntityType`, entityId, appliedBy) | **Built, generic** | Act (flag), Curate (tag-as-list/segment) |
| House Phone text | `SmsConversation` (`@@unique([workspaceId, phone])`, `aiEnabled`, optional `eventId`) + `SmsMessage`; outbound `POST /api/sms/reply` via Twilio | **Built** (Twilio gated to House Phone only) | Act (text) |
| Roster / index | `/operator/members` page → `/api/operator/members` (rows: status, archetype, aiScore, attended, vip, blocked); `MembersView` + `MembersBulkActions` + `AddMemberDrawer` | **Built, upgraded** (bulk actions, add-member) — not the bare version | Curate (filter foundation) |
| First-class List / Segment | — | **Does not exist** (no `List`/`Segment`/`SavedView` model; `Tag`/`EntityTag` is the closest primitive) | Curate (needs decision) |
| Notifications | `OperatorNotification` | **Built** | Act (optional: notify on flag) |
| Audit | `emitEvent` → `AuditEvent` (+ Svix when configured) | **Built** | all (every action audits) |

**Recurring firewall fact (applies to all four):** every capability below writes **operator-authored knowledge** — notes, relationships, flags, list membership, segment definitions. **All of it is internal.** Sponsors only ever see **firmographic match** through the sponsor aggregate (`lib/intelligence/sponsor-safe.ts`, `FieldDefinition.sponsorVisible` fields, the no-JOIN `sponsor_audience_member` projection — no psychographics, no notes, no relationships, no operator intent). **No new table in this roadmap may enter the sponsor projection or the sponsor-safe types**, and `tests/unit/sponsor-firewall.test.ts` stays the gate.

---

## 4. Capability specs

### 4.1 Capture — quick-add + running read

- **What it does:** Add a person met in the wild without the apply flow; keep a running read (notes), full inline edit (Slice 2 F4), and custom fields in Adam's vocabulary (Slice 2 F5).
- **Reads/writes:** Reuses `POST /api/operator/members/create` (status defaults GUEST) and `OperatorComment` for notes. No new write path for the core. The gap is **minimum fields**: today the route requires last name + email; "met in the wild" often has only a name (+ maybe Instagram/phone). Relaxing this is a **route + validation** change, not schema — but **email is the load-bearing identity key** (`@@unique([workspaceId, email])`), so a no-email member needs a synthetic-email or nullable-identity decision (Q-Capture).
- **Schema change: NO** (a synthetic-email convention covers no-email quick-add; only a *nullable email* would be schema, and is not recommended).
- **Firewall:** notes + quick-add fields are internal. A quick-add GUEST never enters a sponsor aggregate unless an admin later marks specific `FieldDefinition`s `sponsorVisible` — and even then only firmographic ones.
- **Slice / size:** **Small.** Minimal-field quick-add (relax required fields, synthetic-email fallback, Instagram/phone capture) + surface the existing notes thread more prominently. Sits directly behind Slice 2.

### 4.2 Relationships — the room as a graph

- **What it does:** Typed member↔member links — *brought*, *referred*, *vouched for*, *close to* — created from a record and shown on it (and reciprocally on the other member). The single `referredByMemberId` FK is subsumed/complemented by a real graph.
- **Reads/writes:** New `MemberRelationship` rows (read both directions for the record's "Relationships" card); optionally backfill the existing `referredByMemberId` as a `referred` edge. Each create emits an audit event and can append an engagement event (`referral_made` already exists).
- **Schema change: YES (additive).** New `model MemberRelationship { id, workspaceId, fromMemberId, toMemberId, type MemberRelationshipType, note String?, createdBy, createdAt, @@index([workspaceId, fromMemberId]), @@index([workspaceId, toMemberId]), @@unique([workspaceId, fromMemberId, toMemberId, type]) }` + `enum MemberRelationshipType`. Purely additive (new table + enum; touches no existing model). **Additive path (never `db push`):** edit `schema.prisma` → `prisma generate` (via `node node_modules/prisma/build/index.js`) → `prisma migrate diff … --script`, review (refuse any DROP/ALTER/RENAME) → `prisma db execute --file <migration.sql>` on the direct URL; never touch `Asset_searchVector_idx`.
- **Firewall:** relationships are operator knowledge — **never** in the sponsor projection. The relationship type is internal; sponsors never learn who vouched for whom.
- **Slice / size:** **Medium.** One additive migration + a relationship create/list API + a record card. Independent of Curate/Act (can ship any time after Slice 2).

### 4.3 Act — operator actions from a record

- **What it does:** A record-level action bar: **Invite to next event**, **Comp Access**, **Flag for sponsor intro**, **Add to a list**, **Text via House Phone**. Each is one click from the person.
- **Reads/writes (reuses existing write paths):**
  - *Invite* → create an `RSVP` (operator origin) / `AccessToken` for a chosen Event (`eventAccess` member gate). Copy: "Invite to <event>" / "Event Access" (never "RSVP").
  - *Comp* → `RSVP.isComp=true` + `compType` + `comp_issued` engagement event ("Comp Access").
  - *Text* → find-or-create `SmsConversation` by `member.phone`, send via `POST /api/sms/reply` (Twilio stays House-Phone-only — no new Twilio surface). Requires `member.phone` + workspace SMS config.
  - *Add to list* → `EntityTag` apply, or a `ListMember` insert **if** Curate adds a first-class list (dependency).
  - *Flag for sponsor intro* → an `EntityTag` (category `sponsor-intro`) **or** a small additive flag. Critically: this flag is **operator intent**, internal — it does **not** expose the member to the sponsor; it queues an operator-driven introduction. Never surfaced to sponsors directly.
- **Schema change: MOSTLY NO.** Invite/comp/text/tag-flag all reuse existing models. *Add-to-list* inherits Curate's model decision. An optional `MemberActionLog` (who invited/comped/flagged whom, when) would be additive but is **not required** — `AuditEvent` already records each action.
- **Firewall:** the sponsor-intro flag and all action history are internal. Sponsors see firmographic match only; an intro is operator-mediated.
- **Slice / size:** **Medium.** Mostly an action-bar UI orchestrating existing endpoints (invite/comp/text) + tag apply. The richest single dependency is *add-to-list* (→ Curate).

### 4.4 Curate — lists, segments, filterable roster

- **What it does:** Build a guest list. Two modes: **static lists** (hand-picked — "Friday's table") and **dynamic segments** (saved filters — "the connectors", "founders in X", "regulars", "gone-quiet"). A filterable roster to assemble either.
- **Reads/writes:** The roster already exists (`/operator/members` + `/api/operator/members`); Curate extends its **query/filter params** (status, tags, attendance recency, firmographic facets, score) — additive query work, no schema. Lists/segments need a persistence decision:
  - **Static list** → either `Tag` + `EntityTag` (a tag *is* a list; **no schema**) or a dedicated `List` + `ListMember` (cleaner: ordering, purpose, per-event guest list — **additive schema**).
  - **Dynamic segment** → a saved filter. Ephemeral (compute on demand, **no schema**) or persisted `Segment`/`SavedView { filter Json }` (**additive schema**).
- **Schema change: CONDITIONAL.** **NO** if static lists ride `Tag`/`EntityTag` and segments stay ephemeral. **YES (additive)** for first-class `List`/`ListMember` and/or `Segment` — same additive path as §4.2. This is the central Curate decision (Q-Curate).
- **Firewall:** list membership and segment definitions are operator artifacts — internal. A segment may *filter on* firmographic facts, but the **list itself is never a sponsor surface**.
- **Slice / size:** **Medium–Large.** Roster-filter expansion is medium; first-class lists/segments add a migration + CRUD + a builder UI. Gating decision (tag-backed vs first-class) sizes it.

---

## 5. Proposed build order + dependencies

Dependency-driven recommendation (ordering itself is **Q-Order**, open):

```
Slice 2  Capture foundation — F4 inline edit + F5 FieldDefinition  (SLICE-2-PLAN.md)
   │
   ├─► Slice 3  Capture polish — minimal-field quick-add + notes surfacing      [small, low-dep]
   │
   ├─► Slice 4  Curate core — roster filters + list/segment model (Q-Curate)    [decision-gated]
   │                 │  (unblocks Act's "add to list")
   │                 ▼
   ├─► Slice 5  Act — record action bar (invite / comp / text / flag / add-to-list)  [reuses RSVP/SMS/Tag + Slice 4]
   │
   └─► Slice 6  Relationships — MemberRelationship graph on the record          [independent; additive migration]
```

- **Slice 3** is the cheapest win and finishes Capture.
- **Slice 4 before Slice 5** because *add-to-list* (an Act action) needs the list model. The rest of Act (invite/comp/text) has no such dependency, so Act could split: **5a** (invite/comp/text — no Curate dep) and **5b** (add-to-list — after Curate).
- **Slice 6 (Relationships)** is independent and can slot anywhere after Slice 2 — order it by product priority, not dependency.

---

## 6. Open questions for Adam (decide; do not infer)

1. **Q-Rel — relationship types:** which edges to support at launch? Proposed: `brought`, `referred`, `vouched_for`, `close`. Directional (brought→) vs symmetric (close↔)? Should the existing `referredByMemberId` be migrated into the graph as `referred` edges?
2. **Q-Act — action priority:** of {invite, comp, sponsor-intro flag, add-to-list, text}, which 2–3 matter most for v1 of the action bar? (Drives whether Act splits 5a/5b.)
3. **Q-Curate — list/segment model:** tag-backed (no schema: `Tag`/`EntityTag` for static lists, ephemeral segments) **or** first-class `List`/`ListMember` (+ persisted `Segment`)? This is the single biggest schema decision in the roadmap.
4. **Q-Capture — quick-add minimum fields:** what's the true minimum to add someone met in the wild — name only? name + Instagram? Is **email** required (it's the identity key), or do we mint a synthetic email for no-email captures (recommended) vs. make email nullable (not recommended — breaks the unique identity model)?
5. **Q-Order — sequencing:** accept the §5 dependency order, or reprioritize (e.g. Relationships before Curate because "the graph" is the headline)?
6. **Q-Flag — sponsor-intro mechanism:** ride `EntityTag` (no schema) or a dedicated flag/queue? Confirm it stays operator-mediated and never auto-exposes the member to the sponsor.

---

## 7. Locked constraints honored (all slices)

- **Design tokens only, no hex** — action bar, relationship card, list builder all use existing tokens.
- **Locked terminology** — Member / Guest / **Comp Access**, **Event Access** (never "RSVP" in UI, even though the model is `RSVP`), human engagement labels via `engagementMeta`. Lists are "guest lists"; "Registration fields" stays the application form's name.
- **Do not touch** `MembershipForm.tsx`, `config/archetypes.ts`, `tagApplication`, or scoring. Capture/quick-add never invokes the live scorer; relationships/lists never re-score.
- **Twilio = House Phone only** — the text action routes through the existing `/api/sms/reply`; no new Twilio surface.
- **Additive schema only, never `prisma db push`** — every schema-touching slice (Relationships; Curate if first-class) follows the §4.2 additive path and never touches `Asset_searchVector_idx` (Producer shares the Postgres instance).
- **Firewall is the gate** — no operator-authored table (relationships, notes, flags, lists, segments) enters the sponsor projection; `sponsor-firewall.test.ts` stays green.
- **Report-don't-fix** pre-existing lint on touched files.

---

## 8. Out of scope (this program / this doc)

- Re-speccing Slice 2 (F4/F5) — see `SLICE-2-PLAN.md`.
- The `/apply` flow, `QuestionDefinition`, scoring, archetypes, psychographics editing.
- Real Clerk-account provisioning for quick-added members (synthetic ids only, as today).
- Network-effect scoring beyond the existing `networkCapitalScore` column (Relationships writes edges; scoring on them is a later question).
- Any schema change in this doc itself (planning only) — the additive migrations are specified, not executed.
- Sponsor-facing surfaces (firewalled and unchanged).
```
