# CRM Spine — Duplication Map & Canonical Model (Phase 2 input)

> Feeds the systems-architect ADR for the merge's CRM spine. Maps every place the
> same real-world entity (person / company) is modeled across Operator + Producer,
> then proposes the canonical shape. Operator detail is verified from
> `prisma/schema.prisma`; Producer detail is from its brief (its repo not visible).
> Pairs with `PRODUCER-OPERATOR-STRATEGY.md` (Phase 2) and the untracked CRM design
> specs in `_context/16-member-intelligence/`. Drafted 2026-06-09.

> **⚠️ 2026-06-09 correction (after PR #62 live-config verification):** Producer
> runs on a **separate** Neon DB (`helium/heliumdb`) and a **separate** Clerk
> instance (`firm-weevil-76`/`maximum-chipmunk-4`) from Operator
> (`app.thenobadcompany.com`). So this is a **greenfield merge of two systems**, not
> an untangle of a shared DB — and **`clerkUserId` is NOT a cross-app join key**
> (different Clerk tenants issue different user IDs). The per-app identity anchors
> below still hold *within* each app; cross-app person matching falls back to
> **email / phone / manual reconciliation**. §3 is updated accordingly.

---

## 1. The duplication — one entity, many models

### PERSON (a human)
| App | Model | Identity anchor | Notable fields |
|---|---|---|---|
| Operator | `Member` | `clerkUserId` (workspace-unique), `email` (workspace-unique) | name, phone, status, tags, energy/network scores, QR/wallet, attendance, referral graph, **soft-merge** (`mergedIntoId`), firmographics (industry, jobFunction, seniority, company, linkedin, instagram, city/country), `customFields`/`fieldProvenance`, `enrichmentStatus` |
| Operator | `MemberPsychographics` | `memberId` (1:1) | archetype, archetypeScores, interests, tasteSignals — **firewalled** (own table so sponsor view can't join it) |
| Producer | `DirectoryPerson` | `clerkUserId` (**GLOBAL**-unique) | claim identity; powers "Mine" task filter |
| Producer | `EventPerson`, `EventStaff` | per-event | people attached to a specific event |

### COMPANY / ORGANIZATION (a brand or firm)
| App | Model | Identity anchor | Notable fields |
|---|---|---|---|
| Operator | `SponsorBrandProfile` | `name` (no external key) | icp/icpTags, category, logo, `declaredObjectives`, `targetPersonaCriteria`, `rightsFeeCents` |
| Producer | `DirectoryCompany` | — | the canonical company in Producer |
| Producer | `Vendor` | `id` (FK'd to SOW/Payment/Document/PortalToken) | the *real* vendor model; deletion Restricted if SOWs/Payments attached |
| Producer | `EventSponsor` | `airtableCompanyId` | per-event **Airtable snapshot**, not a real FK |
| Producer | `EventVendor` | `airtableCompanyId` | per-event Airtable snapshot; `airtableCompanyId` ≠ `Vendor.id` |

**The tax:** a person is modeled up to 4×, a company up to 5×. Sponsors exist on
*both* sides (Operator `SponsorBrandProfile` for intelligence; Producer
`EventSponsor`/`DirectoryCompany` for ops) with no shared key.

---

## 2. Proposed canonical model

A party graph with roles, not separate per-purpose tables:

```
Contact (person)         Organization (company)        Affiliation
  id                       id                             contactId  → Contact
  workspaceId              workspaceId                    orgId      → Organization
  clerkUserId?  ←anchor    name                           title / role-at-org
  email         ←anchor    domain?       ←anchor          isPrimary
  phone, name, location    externalRefs (airtable, ...)
  externalRefs             logoAssetId?
  roles: Role[]            roles: Role[]
  mergedIntoId? (keep soft-merge)

Role (tag on a Contact or Organization, workspace-scoped)
  MEMBER | GUEST | APPLICANT | SPONSOR | VENDOR | STAFF | CONTACT
  + role-specific payload lives in a satellite table, NOT on the party:
      MemberProfile (status, QR, wallet, attendance, referral, scores)
      SponsorProfile (icp, objectives, rightsFeeCents, persona criteria)
      VendorProfile (SOW/payment/portal linkage)
      Psychographics (archetype/interests — FIREWALLED, see §4)
```

Why roles-as-tags + satellites: the same human is often a member *and* a vendor
contact *and* sometimes a sponsor rep. One `Contact`, many `Role`s, one row per
satellite. This is the premium-club reality and the product differentiator.

---

## 3. Identity / join keys (how to dedupe across the two apps)

| Entity | Cross-app join (Operator↔Producer) | Within-app anchor | Notes |
|---|---|---|---|
| Person | `email` → `phone` → manual | `clerkUserId` (per app) | **Clerk is separate per app** (PR #62), so `clerkUserId` does NOT match across Operator/Producer — it only de-dupes *within* each app. Cross-app matching is email-first. Operator `Member.clerkUserId` is workspace-scoped unique; Producer `DirectoryPerson.clerkUserId` is GLOBAL unique — both reference *their own* Clerk tenant. |
| Person (no login) | `email` → `phone` | — | Operator has `@@unique([workspaceId, email])` + a `workspaceId, phone` index. |
| Organization | normalized `name` | `domain` (to be added) | No shared key today. `EventSponsor`/`EventVendor.airtableCompanyId` can seed an `externalRefs.airtable`. |

**Backfill order:** people first (email is the cleanest cross-app key now that
clerkUserId is out), companies second (name-normalization + Airtable-ref pass —
messier). Both apps' user identities will need **Clerk consolidation** as its own
workstream — see PR #62's `firm-weevil-76` vs `maximum-chipmunk-4` reconciliation note.

---

## 4. Hard constraints the spine MUST preserve (do not regress)

1. **Sponsor firewall.** `MemberPsychographics` is deliberately a separate table so
   the `sponsor_audience_member` view physically cannot join archetype/taste data.
   A unified CRM must keep psychographics in a firewalled satellite — merging
   parties must NOT create a join path from sponsor-facing surfaces to psych data.
   (`lib/intelligence/sponsor-safe.ts`, `prisma/sql/sponsor-audience-view.sql`,
   `tests/unit/sponsor-firewall.test.ts` are the guardrails.)
2. **Workspace scoping.** Every party + role + satellite is `workspaceId`-scoped.
   The merge does not relax this; it's the multi-tenant boundary.
3. **RBAC at the service layer, not the surface.** Producer has **no RBAC** ("any
   registered user gets full access"). If Producer surfaces gain a path to the
   shared CRM, the access check must live in the CRM service, because Producer's
   surface won't enforce it. This is a merge-blocker the spine design must own.
4. **Soft-merge semantics.** Operator never deletes a duplicate person — it points
   `mergedIntoId` at the canonical and re-resolves reads. The canonical `Contact`
   must carry this forward (no hard dedupe/delete).
5. **Producer's Event-only contract.** Today Producer is walled off from
   Member/RSVP/Ticket and reads RSVP *counts* from Airtable. The CRM spine is the
   sanctioned widening of that contract — design the read scopes deliberately.

---

## 5. Open questions for the ADR

1. **Who owns the CRM service?** A new shared package, or does one app host it and
   the other call it? (Ties to the Replit-migration decision — a shared service
   wants one runtime.)
2. **Company identity:** add a real `domain` anchor + dedupe strategy, or lean on
   Airtable as the external source of truth during transition?
3. **Migration sequencing:** the CRM tables are new/additive, but they touch
   `Member`/`SponsorBrandProfile` — so they should not be authored until Operator's
   migration-history drift is reconciled (flagged in the overnight data audit,
   `today-data.md`: ~10 live objects + the `MemberEngagementEventType` enum exist
   only via hand-run `prisma/sql/*.sql`, not in `prisma/migrations/`).
4. **Does Producer's `DirectoryPerson` become a read-through of `Contact`, or is it
   migrated and retired?** Affects the "Mine" task identity path.
