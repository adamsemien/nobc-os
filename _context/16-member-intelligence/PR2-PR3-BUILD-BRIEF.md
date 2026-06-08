# Member Intelligence — PR2/PR3 Build Brief (mapped to NoBC OS)

_Apex, 2026-06-06. Hand to Claude Code. Corrections applied: (1) no Person table — Member IS canonical; (2) RLS deferred to Phase 2, PR2 firewall = psychographic query-layer firewall; (3) sales-CRM mechanics yes, pipeline/deal/forecasting no._

PR1 (the identity/merge spine) is DONE and green. This brief covers PR2 (structural) and PR3 (frontend MVP).

---

## 1. STRUCTURAL (PR2 — additive migration on Member, must land before any frontend read)

All additive. Edit `schema.prisma` → `prisma generate` → `migrate diff` (must show only the GIN-index / sample-table noise) → Adam runs `prisma db execute` on the **unpooled** endpoint (`DIRECT_URL`). Never `db push`. Never touch `Asset_searchVector_idx`.

| # | Item | Shape | Priority |
|---|------|-------|----------|
| **S1** | `Member.customFields Jsonb?` | flexible firmographic/demographic values keyed by `FieldDefinition.stableKey` | **P0** |
| **S2** | `Member.fieldProvenance Jsonb?` | `{ [fieldKey]: { value, source, confidence, syncedAt } }` — per-field provenance (matches specced shape) | **P0** |
| **S3** | **`MemberPsychographics`** (new 1:1 table, `memberId @unique`) | `archetype String?`, `archetypeScores Jsonb?`, `interests String[]`, `tasteSignals Jsonb?` — **physically separate table so the sponsor firewall is structural, not a column-omission convention.** Back-relation on Member is the only Member change. | **P0** |
| **S4** | `FieldDefinition` (new, `workspaceId`-scoped) | `stableKey, label, dimension (firmographic\|demographic), type, audience (sponsor_ok\|internal_only), order, isActive` — mirror the existing `QuestionDefinition` pattern | **P0** |
| **S5** | `Member.enrichmentStatus` enum (`NONE\|PENDING\|PARTIAL\|COMPLETE\|STALE`) + `enrichmentLastSyncedAt DateTime?` | provenance lifecycle scalars | P1 |
| **S6** | `Member.city`, `Member.country` | demographic geo (today only on Application) | P1 |
| **S7** | `Member.companyName`, `companyDomain`, `linkedinUrl` | firmographic, sponsor-facing | P1 |
| **S8** | **Sponsor firewall view** `sponsor_audience_member` | out-of-band SQL (`prisma/sql/sponsor-audience-view.sql`, same class as the GIN index — never `db push`). Selects ONLY firmographic + coarse demographic + provenance + `WHERE mergedIntoId IS NULL`. **Physically omits** everything in `MemberPsychographics`, `aiSummary`, scores, raw `householdIncome`. | **P0** |
| **S9** | `lib/intelligence/sponsor-safe.ts` | exported type that structurally cannot carry psychographic fields + a **failing-import test** asserting no sponsor-facing module imports `MemberPsychographics`/`archetype`/`interests` | **P0** |
| **S10** | **Remediate the live leak** | `app/operator/intelligence/sponsor/page.tsx` reads `Application.archetypeScores` TODAY and renders `archetypeAverages` — move that off the sponsor surface (PR1 was forbidden to touch it; **PR2 owns it**). Assert via test archetype never reaches recap/`/doc`/`/assets`. | **P0** |

> Psychographic copy to `MemberPsychographics` is an **additive populate step** — it does NOT modify `config/archetypes.ts` or the scoring system. Archetype keeps living on Application too; the populate just mirrors it onto the firewalled table.

---

## 2. FRONTEND / INTERACTION (PR3) — MVP cut

**MVP (build this — a world-class first member record):**
- **F1** Member record page — upgrade `app/operator/members/[id]`: identity header, derived lifecycle badge (GUEST→PENDING→APPROVED), Red List flag, merge status.
- **F2** Engagement timeline — reverse-chron from `MemberEngagementEvent` (already indexed by `memberId`/`occurredAt`), virtualized.
- **F3** Provenance display — per-field source badge (self_reported / operator_entered / ai_inferred / verified_enrichment) + confidence on hover.
- **F4** Fast inline edit — click-to-edit fields, optimistic save, keyboard-commit.
- **F5** Add/edit person — slide-over (reuse `AddMemberDrawer`).
- **F6** Dimension panels — Firmographic + Demographic (operator) + **Psychographic (operator-only, firewalled)**, read + edit core fields.
- **F7** Merge-confirm surface — duplicates banner; **wires the existing `findMergeCandidates`/`executeMerge` engine** (email-exact auto already supported, phone = operator-confirm). High value, cheap — the engine is built/tested.
- **F8** Referral tree — `referredByMember` / `referredMembers`.

**LATER (deferred — do NOT build in PR3):**
- NL query (Vanna) → V1.5
- Custom-field **builder** UI (operators authoring `FieldDefinition`) → V1.5. **MVP ships a fixed/seeded field set.**
- MCP layer → V1.5
- Enrichment sync engine (in-house) → V1.5
- Analytics / guest→member funnel dashboard → V1.5
- Per-workspace branding → Phase 2
- Custom objects → Phase 2/never (sales-CRM filter)
- Pipeline / deal / forecasting → **never** (correction 3)

---

## 3. CONCRETE BUILD SPEC per MVP item

Stack: Next.js 15 App Router (server-component shell + client islands), Prisma 7/Neon, TanStack Query + TanStack Virtual, Radix, cmdk, design tokens only.

- **F1 Record page** — copy **Attio / Linear issue-detail** layout: left identity rail (avatar, name, lifecycle badge, key facts), main column = panels + timeline. Server component fetches the Member (+ `MemberPsychographics` for operators only) in one Prisma call; client islands for edit/timeline. Tokens: `bg-primary`/`text-text-primary`, NBC Red accents. Terminology: "Member / Guest / Comp", "Event Access", "Registration fields".
- **F2 Timeline** — copy **Stripe customer / Attio activity feed**. `db.memberEngagementEvent.findMany({ where:{ memberId }, orderBy:{ occurredAt:'desc' } })`, TanStack Virtual for long histories, grouped by day. Map enum types → human labels (the locked terminology, never raw enums).
- **F3 Provenance** — copy **Clay/Attio source pills**. Read `fieldProvenance[key].source` → small Radix `Tooltip` badge; `ai_inferred` visually distinct (it's excluded from sponsor aggregates). No raw confidence numbers in sponsor scope.
- **F4 Inline edit** — copy **Linear/Attio click-to-edit**. Radix `Popover`/inline input; optimistic `useMutation` (TanStack Query) → `PATCH /api/operator/members/[id]` (new, `requireRole(STAFF)`), writes the value + stamps `fieldProvenance[key] = {source:'operator_entered', syncedAt: now}`. Rollback on error.
- **F5 Add/edit person** — reuse the existing `AddMemberDrawer` slide-over; it already routes through the canonical create. Extend with the new dimension fields.
- **F6 Dimension panels** — Firmographic/Demographic render from `customFields` + `FieldDefinition` (seeded set). Psychographic panel reads `MemberPsychographics` and is **gated `isStaff` server-side** AND absent from any sponsor code path.
- **F7 Merge-confirm** — copy **Attio/HubSpot "possible duplicates"** banner. On record load call `findMergeCandidates(workspaceId, memberId)`; show email-exact (auto, or one-click confirm) and phone (operator-confirm) candidates; confirm → `POST /api/operator/members/[id]/merge` → `executeMerge`. cmdk action: "Merge duplicate…".
- **F8 Referral tree** — simple two-level list from `referredByMember`/`referredMembers`; link each to its record.

---

## 4. CONSTRAINTS (baked in) + CONFLICTS

Baked in:
- **Psychographic → sponsor firewall at the query layer** — enforced by the *separate* `MemberPsychographics` table + the `sponsor_audience_member` view + `sponsor-safe.ts` type + failing-import test. Not UI-only.
- **Per-field provenance** — every operator/enrichment write stamps `fieldProvenance`. Sponsor aggregates draw only from `self_reported` + `verified_enrichment`; never `ai_inferred`; suppress small-N buckets.
- **Additive-only on Member** — never `db push`, never touch `Asset_searchVector_idx`; Adam runs `db execute` on the unpooled endpoint.
- **Design tokens only**, **locked terminology** (Access/Event Access, Member/Guest/Comp Access, Registration fields; never raw enums in UI).

Conflicts flagged:
1. **LIVE firewall violation** — `sponsor/page.tsx` reads `Application.archetypeScores` today. PR2 **must** remediate (S10). This is the single open psychographic leak.
2. **Archetype lives on Application, not Member** — the PR2 copy to `MemberPsychographics` is additive + a populate step; it must NOT alter `config/archetypes.ts` or scoring (locked).
3. **`customFields` querying at scale** — JSONB is fine for V1 read/write; if sponsor aggregates start filtering on custom fields, add a GIN index (additive) or normalize to `MemberFieldProvenance` in Phase 2. Not an MVP concern.
4. **RLS is NOT here** — app-layer `workspaceId` filtering remains the boundary (Producer shares the DB); full RLS is Phase-2 multi-tenant hardening, not a PR2 blocker.

---

## 5. SEQUENCING (one ordered list)

1. **PR2 — structural (additive migration + firewall).** S1 customFields, S2 fieldProvenance, S3 `MemberPsychographics`, S4 `FieldDefinition`, S5 enrichmentStatus, S6 city/country, S7 company fields → one additive SQL file (Adam runs it). Then S8 sponsor view (out-of-band SQL), S9 `sponsor-safe.ts` + failing-import test, **S10 remediate the live sponsor archetype read.** Gate: firewall test green before any sponsor-facing surface ships.
2. **PR3 — frontend MVP.** F1 record page → F2 timeline → F3 provenance → F4 inline edit → F5 add/edit → F6 dimension panels → F7 **merge-confirm UI (wire the existing engine)** → F8 referral tree. Ships against the seeded `FieldDefinition` set.
3. **V1.5.** NL query (Vanna), analytics/funnel dashboard, custom-field builder UI, enrichment sync engine, MCP layer, public API + Zapier.
4. **Phase 2.** Per-workspace branding, custom objects, RLS / multi-tenant hardening, native marketing integrations, provenance normalization.
5. **Never.** Pipeline / deal / forecasting (sales-CRM filter holds).

**Critical-path rule:** nothing in PR3 reads a Member dimension until its PR2 column exists and the firewall test is green. S8–S10 (firewall) gate every sponsor-facing surface.
