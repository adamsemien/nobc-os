# Influence Model — Member & Guest Intelligence Layer

**Status:** Scope locked. Builds into the Relationships slice (roadmap step 4), not before.
**Supersedes:** the "relationship types (brought / referred / vouched for / close)" OPEN question in `OPERATOR-CRM-ROADMAP.md` (§6 Q-Rel). That question is now closed by this decision.

---

## Decision

NoBC does not build a hand-typed relationship-type taxonomy. Enumerating human relationships rots and reads goofy the moment someone is both a friend and a business partner. The social graph is modeled in three layers, sorted by how each edge is sourced.

Two concepts that were being conflated, now separated cleanly:

- **Lifecycle status** (Guest / Applicant / Member / Comp Access) is a state on the person that progresses (a guest becomes a member). That progression is exactly why a static "type" felt wrong. It is F1, it already exists, it is not a relationship type. Do not rebuild it here.
- **The social graph** (who brought, knows, influences whom) is the Relationships capability and is the subject of this doc.

---

## Layer 1 — Referral spine (authored, structural). Build in the Relationships slice.

A single self-referential relation on the person record: `referredBy` (person to person, the member responsible for this person being in the community).

- It is a relation, not free text, and because it is self-referential it is already a graph: one referrer fans out to many referred. "Field vs graph" was a false binary.
- Set at entry. One primary referrer per person. Many referred per referrer.

What it powers, all internal and operator-facing:

- **Connector ranking:** who sponsored the most, weighted by how many became approved or active members.
- **Lineage and trust chains:** B brought by A brought by the founder.
- **Accountability blast radius:** a connector leaves or goes sideways, you can see everyone downstream of them.

This is the spine of the sphere of influence. A single relation delivers it.

## Layer 2 — Lateral web (derived, not authored). Additive layer, later.

The dense who-overlaps-with-whom graph is derived from co-attendance and co-engagement, never hand-typed.

- Source: the engagement timeline already owned. Two people repeatedly at the same intimate events have a real connection nobody had to type.
- Computed. Gets denser and more accurate every event NoBC runs, on its own. Same philosophy as firmographic enrichment: derive from owned signal, do not hand-maintain.
- This is the real "sphere of influence" layer.
- Not in scope for the first Relationships slice. Build after the spine exists and there is enough event data to make it meaningful.

## Layer 3 — Explicit override (authored, sparse). Deferred until needed.

A generic untyped "connection" link with a free-text note, for edges that are known but derivation cannot see yet (married, co-founders).

- Sparse by design. No taxonomy, no required type.
- Deferred until there is a concrete need (paired invites, seating).

---

## Explicitly killed

The brought / close / vouched-for / referred typed-edge taxonomy. Reasons:

- Enumerating human relationships rots.
- "Brought" is event-scoped: it is a plus-one fact on an attendance, which already lives in the engagement timeline. Not a standing edge.
- "Referred / vouched / sponsored" all collapse into the single Layer 1 edge (`referredBy`).

---

## Guardrails

- **Firewall:** the entire influence model (spine, web, override, connector ranking) is internal operator-curation knowledge. Never sponsor-facing. Sponsors only ever see firmographic persona-match. `tests/unit/sponsor-firewall.test.ts` stays the gate.
- **Scoring:** connector ranking and influence signals do not feed application scoring. Do not touch `tagApplication`, `config/archetypes.ts`, or scoring.
- **Schema:** additive only. Never `prisma db push` (it drops `Asset_searchVector_idx` and can break Producer on the shared Neon DB). Process: edit schema, `prisma generate`, migrate diff to review SQL, `prisma db execute`. Adam runs the execute.

---

## Build placement

Roadmap step 4 (Relationships). Not before Slice 1 is committed and Slice 2 (inline edit + custom fields + notes) is in. The spine is the only Layer 1 work; the web and override are later additive layers.

---

## Implementation note (verified against `prisma/schema.prisma`, 2026-06-09)

The Layer 1 spine relation **already exists in the schema** — Layer 1 needs **no migration**:

- `Member.referredByMemberId String?` + self-relation `MemberReferrals` in both directions: `referredByMember` (the referrer, lineage up) and `referredMembers Member[]` (the fan-out, lineage down).
- `@@index([referredByMemberId])` is present.
- `Member.networkCapitalScore Float?` exists (the column connector-weighting can populate later).
- The quick-add create route (`POST /api/operator/members/create`) already accepts and workspace-validates `referredByMemberId`, stamping `referredBy` provenance.
- `Application.referredBy String?` is the legacy free-text field; it is the entry-time capture, not the graph edge.

So the first Relationships slice is **additive application work, no schema change**:

1. An affordance to set/clear `referredBy` on an existing record (it is currently in `READONLY_MEMBER_KEYS`, so it is not inline-editable yet — this needs a dedicated referrer picker, not a free-text edit, since it is a relation to another member).
2. A "Sphere of influence" card on the record: referrer (lineage up) + referred members (fan-out down), each linking to its record.
3. Connector ranking: an operator view ranking referrers by downstream count, weighted by how many became approved/active. Reads the existing graph; no new table.

Layers 2 (lateral web from co-attendance) and 3 (explicit override link) remain additive future layers and are out of scope for this first slice.
