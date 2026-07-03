# Event Builder Rebuild - NBS Cutover Checklist

> Phase D deliverable (2026-07-02, branch `feat/event-builder-rebuild`).
> Every step is marked **ADAM-GATE** (only you execute/decide) or **SAFE**
> (reversible, no live-behavior change). Order matters. The live No Bad
> Saturday page renders identically until step 7 - everything before it is
> preparation, everything after it is verification.
>
> Rollback at any point after step 7: `--rollback` on the converter deletes
> the gate and the legacy path renders again, byte-identical (rehearsed in
> tests/unit/cutover-converter.db.test.ts).

## The seams being replaced

`lib/active-event.ts` (`ACTIVE_EVENT_ID`, default = the NBS event id) has
exactly five import sites on this tree, plus two presentation hacks:

| # | Site | What it does today | What replaces it |
|---|---|---|---|
| 1 | `app/api/apply/membership/[id]/submit/route.ts:10` | Door 1: membership submit issues a pending comp RSVP on the active event | Post-cutover: the apply flow stays as-is for July 11; next event onward, membership-linked access is a gate composition (HOLD_MEMBERSHIP inside ANY) and the comp wiring retires with the active-event concept. ADAM-GATE decision per event. |
| 2 | `app/api/operator/applications/[id]/reject/route.ts:7` | Reject cancels the Door 1 comp RSVP on the active event | Retires together with #1 - rejection then only touches the application; gate proofs expire with their nodes. |
| 3 | `app/m/events/[slug]/_components/TemplateSplit.tsx:10` (lines 46-47) | `isActiveEvent` forces object-contain hero + anon DoorFork | Hero fit becomes a per-event setting (add `heroFit` to the builder later - additive column, NOT in this branch); the DoorFork disappears because a gated event's public page IS the door. |
| 4 | `lib/agent/tools/applications/reject.ts:5` | Agent-side mirror of #2 | Retires with #2. |
| 5 | `lib/applications/approve.ts:8` | Approve confirms the Door 1 comp RSVP | Retires with #1. |
| + | `app/e/[slug]/_components/DoorFork.tsx` | The two-choice anon card, reached only via #3 | Deleted when #3 retires. |
| + | Blanked `EventWorkflow.paths` (`'[]'`, hand-run SQL) | Kept the ghost free-entry card dead | The new builder never writes EventWorkflow; the WorkflowPathsCard renders nothing for missing/empty paths. Row can stay forever or be deleted at step 11 - either is safe. |

## Checklist

1. **ADAM-GATE - Review + merge `feat/event-builder-rebuild`.** Nothing in
   the branch changes live behavior on its own: new routes are parallel, the
   NBS baseline suite pins the legacy render, `GATE_PAY_LIVE_CHARGES` stays
   unset (gate payments refuse to mint on a live key until you set it).
2. **ADAM-GATE - Apply the one additive SQL to production** (Neon console,
   dry-run first): `prisma/sql/event-builder-phase-a.sql` - a single
   `ALTER TYPE "ProofMechanism" ADD VALUE 'COMP_CODE'`. No tables, no drops.
3. **SAFE - Deploy.** The live NBS page renders identically (baseline suite
   + protected seams untouched). The builder, preview, gate routes, refunds
   v2, and mass refund are all live but dormant for NBS.
4. **ADAM-GATE - Set `GATE_PAY_LIVE_CHARGES=1` in Vercel** only when you
   intend gate payments to charge real cards. Until then every gate PAY
   mint on the live key returns 503 by design.
5. **SAFE - Compose + verify the gate on a REHEARSAL copy.** In the builder,
   duplicate the NBS shape on a scratch event (or trust the rehearsal test -
   the converter run is identical), preview it at `/e/preview/...`, walk a
   test purchase in Stripe test mode.
6. **ADAM-GATE - Marketing-readiness check.** Confirmation email renders the
   way you want, comp codes for the house list exist (create them in the
   builder), capacity is set, sold-out copy reads right.
7. **ADAM-GATE - Run the converter against production.**
   `CUTOVER_CONFIRM=NBS npx tsx scripts/cutover/nbs-to-v3.ts --execute`
   (dry-run first without the flag; it prints the exact gate spec). This is
   the flip: the public NBS page becomes the gate walkthrough
   (members free via live membership check, guests pay $25, comps via code).
   Legacy fields are not touched - rollback is `--rollback`.
8. **SAFE - Verify the live page end to end.** Anon view, member view, one
   real $25 purchase (refund it via the operator UI - which now also proves
   refund-revokes-proof live), one comp code redemption.
9. **ADAM-GATE - Point marketing at the page. Marketing can start.**
10. **SAFE - Post-event or post-confidence: retire the seams.** Delete the
    five `ACTIVE_EVENT_ID` import sites' special-casing, `DoorFork.tsx`,
    and the `isActiveEvent` hero fork (give the builder a hero-fit setting
    first if the contain look should survive). Each is a small PR against
    a page the gate now owns.
11. **SAFE - Demolish the legacy operator surface** once no pre-v3 event
    needs editing: `QuestionsTab.tsx`, `RegistrationFieldsEditor.tsx`,
    `TierManager.tsx`, `AccessGroupsCard.tsx`, `FlowBuilder.tsx`,
    `FlowPreview.tsx`, `TemplatePicker.tsx` (old edit tab wiring), the
    legacy columns freeze (accessMode / priceInCents / approvalRequired /
    eventAccess stay readable, never written). The v1 payment-intent routes
    retire when the last legacy-flow event is done.

## What is deliberately NOT in this cutover

- No schema migration beyond the one additive enum value.
- No waitlist, transfers, multi-ticket, series, door-selling (next directive).
- No change to the apply flow, scoring, or archetypes - Door 1 works exactly
  as it does today until step 10 retires it per-event.
