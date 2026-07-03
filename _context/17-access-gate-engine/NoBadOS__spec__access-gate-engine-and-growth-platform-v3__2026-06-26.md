# NoBC OS — Access Gate Engine v3 + Event Builder Rebuild

**Date:** 2026-06-26
**Status:** DRAFT for red-pen. Locked sections become CC build prompt sources, one milestone at a time.
**Owner:** Adam
**Model authoring this:** Opus
**Supersedes:** v1/v2 of this spec (`NoBadOS__spec__access-gate-engine-and-builder__2026-06-26.md`), the current "smoke and mirrors" event builder, and the implicit hardcoded RSVP/ticket/apply fork.
**What changed v2 → v3:** (1) the engine is now a nested rules engine (boolean expression tree), not a flat condition list; (2) a four-tier verification model with first-party owned-surface telemetry as the gold standard; (3) the Gate is generalized to gate ANY resource, not just an event; (4) proofs roll up into a growth graph; (5) the framing shifts from "access gate for events" to "growth engine for membership companies."

---

## 0. The thesis

**NoBC OS is a growth engine for membership companies. Access is the currency; verified action is how it's earned; every action compounds the company's own assets — its members, its reach, its revenue, its data. The Access Gate isn't a form on an event. It's how an operator prices growth, on any resource, in actions instead of dollars.**

The loop the whole product serves:

> Someone wants in → you require a verified action to get in → the action grows a company asset (revenue, membership, reach, reliability, curation) → growth earns deeper access → deeper access motivates the next action.

The guest doesn't pay to get in. **The guest grows the company to get in.** Because every action is a first-party event on a surface the operator owns, every act of growth is captured, attributed, and permanent — which is what makes the same primitive simultaneously a referral engine, a self-building CRM, an events platform, and a reputation system. The unifying atom is **the verified action.**

If a decision doesn't make the lock more composable, the operator's growth strategy more obvious, the guest's moment more ritual, or the proof more honestly verifiable, it's out of scope.

> **Honest staging note (carried from the strategy session):** the *primitive* is excellent; the *business* is unproven. The validated path is to build this because NoBC (Tenant Zero, ~474 warm contacts) needs it weekly, prove the loop on NoBC's own events over ~10 cycles, and only then sell the platform. Multi-tenant cleanliness is built in because it's nearly free; multi-tenant *selling* is a post-proof, 2027 concern. The companion research brief (`NoBC_OS__Path_to_Product-Market_Fit...`) tests the wound / wedge / moat before any platform-scale investment.

---

## 1. Why the current thing has to die

The current `/e/` page hardcodes a three-way fork (open RSVP / paid ticket / apply) in component logic. Tonight's payment bug was a symptom: the fork was a viewer-ternary buried in `EventAccessFlow.tsx`, the ticket price lived in two places (`eventAccess` jsonb and `TicketTier`), and "apply" was a separate flow stapled on. There is no primitive — no way to say "apply AND pay," "follow OR be referred," or "member-or-pay," and nothing to license to an operator who wants to compose their own access logic without us touching their code.

The fork is a degenerate case of the lock. We replace three hardcoded paths with one engine that expresses all three plus everything between — and then gates not just events but membership tiers, content, and perks with the same engine.

---

## 2. Core model — the nested rules engine

### 2.1 It is a rules engine. Name it that.

A Gate is a **boolean expression tree with typed, tiered-verification leaf predicates.** Naming it correctly is the unlock: it tells us the engine is the solved, easy part (a recursive evaluator), and that all the real product risk lives in two UI surfaces (the Builder's tree composer and the guest render). We spend the engine budget once, correctly, and spend the real effort on making the tree read like a sentence.

**Flat is the trivial tree.** A simple gate is just a root GROUP node with rule `ALL` and a flat list of leaf CONDITIONs. Nesting is the same model one level deeper. Building the tree from day one gives us flat *for free* and nesting *for cheap* — and avoids the trap of shipping flat then rebuilding schema + evaluator + Builder + guest-render + a prod migration to add nesting later.

### 2.2 Vocabulary (use these words everywhere — UI, DB, agent)

- **Gate** — the whole lock on one resource. A tree of nodes plus the resource it protects.
- **GateNode** — a node in the tree. Either a **GROUP** (has a satisfaction rule, has children) or a **CONDITION** (a leaf — the "tumbler").
- **Condition** (leaf / tumbler) — one requirement, with a `type`, a `config`, a `verificationTier`, a `proofMechanism`, and `required`/`weight` flags.
- **Satisfaction rule** (on GROUP nodes) — `ALL` (every required child passes), `ANY_N` (any N children pass), `WEIGHTED` (sum of satisfied child weights ≥ threshold). A child marked `required: true` must pass regardless of the rule (e.g. payment is always required even inside an ANY group).
- **Proof** — a permanent record that one member satisfied one Condition: evidence, timestamp, verifier result, trust tier. **A returning guest carries proofs forward — we never re-verify what we already know.** Proofs roll up into the growth graph (§6).
- **Verifier** — what decides a Condition is satisfied. Tiered (§3).
- **Open** — the tree evaluates true. Opening mints the access record and fires the confirmation (the emotional peak).
- **Resource** — the thing being gated. An event, a membership tier, a piece of content, a perk (§5). Event is just the first.

### 2.3 The evaluator (the whole engine, ~15 lines)

```
evaluate(node, proofs):
  if node.kind == CONDITION:
    return isSatisfied(node, proofs)          // proof lookup / live verifier
  children = node.children.map(c => evaluate(c, proofs))
  // required children must all pass regardless of rule:
  if node.children.any(required && !satisfied): return false
  switch node.rule:
    ALL:      return children.every(true)
    ANY_N:    return countTrue(children) >= node.ruleThreshold
    WEIGHTED: return weightedSum(children) >= node.ruleThreshold
```

Recursion is what makes nesting *cheaper* to build correctly than a flat special-case: the combine logic is written once and works at every depth. **Leaf predicates don't know or care where they sit in the tree** — every verifier is identical whether the condition is at the root or three levels down. Nesting is purely an engine + Builder concern.

---

## 3. Verification — four tiers, honest about its own certainty

You cannot validate everything. The system must never pretend it can. Every Condition declares a `verificationTier` and a `proofMechanism`, and the Builder shows the operator, in plain language, exactly how solid each tumbler is. That honesty is what makes the platform trustworthy instead of theater.

### 3.1 The four tiers

1. **Tier 1 — Provable (the gold standard).** The platform *knows* it happened.
   - **First-party owned-surface events** — anything on a surface the operator owns: RSVP, check-in scan, referral-link click, portal action, page visit, plus-one-completed-the-gate, prior attendance, membership status. **This is the foundation of the whole engine.** It can't be revoked by a third party's policy change, it produces a permanent owned record (feeding the CRM and sponsor product), and its variety is *unbounded* because the operator can always mint a new owned surface (a link, a code, a portal action) to capture a new behavior.
   - **Financial / on-chain** — Stripe `payment_intent.succeeded`, wallet/token reads. The rail tells the truth.

2. **Tier 2 — Third-party API.** A platform we don't control tells us the truth through an authenticated API with the user's OAuth consent (Instagram follow, LinkedIn profile). **Real but shrinking and breakable** — these APIs narrow every year (IG killed most follow-checking; "shared to story" is barely checkable). A Tier-2 verifier can go dark when a platform changes policy. The engine treats Tier-2 verifiers as things that can *break*, never as permanent guarantees, and degrades gracefully (falls back to evidence-upload) when one dies.

3. **Tier 3 — Unverifiable. Handled, not faked.** "I sent an email," "I'll bring a record." No API proves this. Three honest mechanisms:
   - **Self-attestation** — the guest checks "I did this"; the system records the *claim* tied to their real identity and standing. Not verified, *attributed*. Low-stakes; works because lying on an on-the-record attestation as yourself is socially expensive in a curated community.
   - **Evidence upload + human review** — the guest *shows* the thing (screenshot, photo, link); it routes to the operator's approval queue (the same human-review path the scoring model uses); a human accepts it. The universal escape hatch — one condition type covers an infinite long tail of "do X" asks because **the human is the verifier.**
   - **Door-confirmation** — checked in person at check-in (bring the invitation, show the thing). Provisional online, confirmed at the door — verification moved to the one moment there's ground truth: a body in front of the operator.

### 3.2 The design principle that converts Tier 3 → Tier 1

**Whenever you want to gate on an action, route that action through a surface or artifact you own, and it becomes provably true.** You're not limited to what you own — you *expand* what you own to capture the action you care about.

- "Email someone" (unverifiable) → "send someone **your referral link**" (the link, the click, the resulting signup are all yours) — **provable.**
- "Share us on your story" (IG won't reliably say) → "share **this tracked link**" — every open is yours.
- "Tell your friends" (air) → "invite via **your member portal**, we watch who joins through you" — first-party, perfect.

The operator-and-agent guideline: don't ask "can I verify this third-party action?" Ask "can I move this action onto something I own so it becomes a first-party fact?" Most of the time, you can. This is the moat made concrete — Instagram can kill its API tomorrow; nobody can kill the operator's ability to watch their own surfaces.

### 3.3 The proof contract

The engine stores **four kinds of proof with different trust levels** — `verified` (Tier 1), `api-verified` (Tier 2), `attested` / `evidence-accepted` (Tier 3 honor/human), `door-confirmed` (Tier 3 deferred). Every proof carries its tier so the operator, the CRM, and the growth graph always know how solid each fact is. An attestation is never silently treated as a cryptographic verification.

---

## 4. The Condition type registry (the extension point)

Each Condition type is a plugin with a fixed contract. **No Condition type appears in the Builder or to the agent until its server-side verifier exists, is tested, and its migration is live.** (Hard invariant — the existing gate-engine law, restated.) Adding "donate to this cause" later is a new registry entry plus a verifier, not an engine change. **The registry being open is the un-copyable moat** — competitors hardcode "ticket or RSVP"; we ship a lock-builder.

| type | what the guest does | verifier / tier | v? |
|---|---|---|---|
| `ANSWER_QUESTIONS` | answers operator's questions | scoring model (Sonnet), threshold or human-review — Tier 3 AI-attested | **v3 M1** |
| `PAY` | pays $X | Stripe — Tier 1 | **v3 M1** |
| `REFERRED_BY_MEMBER` | names/links a referring member | internal lookup — Tier 1 first-party | **v3 M1** |
| `ATTENDED_PRIOR` | (passive) has a prior check-in | internal lookup — Tier 1 first-party | **v3 M1** |
| `HOLD_MEMBERSHIP` | is an approved member / holds a tier | internal lookup — Tier 1 first-party | **v3 M1** |
| `BRING_QUALIFYING_PLUS_ONE` | invitee completes the gate too | closed-loop link — Tier 1 first-party | v3.1 |
| `ATTENDANCE_REPUTATION` | (passive) reliable RSVP→check-in history | internal lookup — Tier 1 first-party | v3.1 |
| `EVIDENCE_UPLOAD` | shows proof (screenshot/link) | human review — Tier 3 evidence | v3.1 |
| `FOLLOW_INSTAGRAM` | follows the workspace IG | IG Graph API — Tier 2 (breakable) | v3.1 |
| `CONNECT_LINKEDIN` | connects LinkedIn, AI reads it | oauth + scoring — Tier 2/3 | v3.1 |
| `SHARE_TRACKED_LINK` | shares a platform-minted link | link telemetry — Tier 1 first-party | v3.1 |
| `REFER_SOMEONE` | refers someone who gets in | closed-loop — Tier 1 first-party | v3.1 |
| `VOICE_NOTE` | records a short voice note | transcription + scoring — Tier 3 AI | v3.1 |
| `HOLD_TOKEN` | proves wallet holds an NFT/token | on-chain read — Tier 1 | Phase 2 |
| `WEBHOOK` | satisfies any external check | operator-defined webhook — operator-trust | Phase 2 |

### 4.1 The contract every Condition type implements (server side)

```
ConditionType {
  type: string                       // enum value, stable
  verificationTier: TIER1|TIER2|TIER3
  proofMechanism: VERIFIED|API|ATTESTED|EVIDENCE|DOOR
  configSchema: ZodSchema            // what the operator sets
  guestPrompt(config): GuestPromptDTO // what the guest sees / does
  verify(config, submission, member): VerifyResult
       // { satisfied, score?, tier, proof, needsHuman? }
  isPassive: bool                    // auto-evaluated from existing data (ATTENDED_PRIOR)
  feedsProfile(proof): ProfilePatch  // permanent enrichment of the member profile
  feedsGrowthGraph(proof): GrowthEdge? // referral/plus-one edges into the growth graph
}
```

This contract is the whole engine. The Builder reads `configSchema` to render the operator control and `verificationTier`/`proofMechanism` to render the honesty badge. The guest page reads `guestPrompt` to render the tumbler. `feedsProfile` + `feedsGrowthGraph` are why every gate interaction enriches the company forever.

---

## 5. The Gate gates ANY resource (the generalization that makes it a platform)

"In or out of an event" is the event framing. "Deeper access earned through more action" is the growth framing. The same engine that gates an event must gate **anything** — a membership tier, a portal area, a piece of content, a perk. So the Gate is **polymorphic**: it protects a `resourceType` + `resourceId`, not a hardwired `eventId`. The launch event is just the first resource type that has a gate. This is the single change that turns event tooling into a growth platform.

```
resourceType enum: EVENT | MEMBERSHIP_TIER | CONTENT | PERK | (extensible)
```

Everything else in the engine is resource-agnostic. An operator can gate "the Founders tier" behind "be referred by 2 members AND attend 3 events," exactly as they gate an event behind "pay OR apply."

---

## 6. Proofs roll up into a growth graph (the data asset)

Every proof is a node in a graph of **who-grew-the-company-how.** Referrals and plus-ones are edges. Payments are revenue nodes. Attendance is reliability signal. This graph is not a byproduct — it's first-class:

- **Per-member rollup:** "brought 6 net-new qualified members, drove 40 referral-link clicks, attended 11 of 12 events, reliability 92%." Feeds the CRM and the member profile.
- **Per-company rollup:** the operator's growth dashboard — which gates produced which growth, show-rate by gate type, referral-conversion rate.
- **The latent network asset (Phase 2, research-gated):** a **privacy-safe cross-tenant trust graph** — portable reputation (reliability, referral quality, contribution) true across tenants, à la Stripe Radar's cross-merchant fraud signal. The signal improves with every event run by every tenant; nobody can clone it without the network. *Aggregated reputation only, never raw cross-tenant PII; viability (legal + cultural) is an open research question, NOT a v3 build.*

`GateProof.feedsProfile` and `feedsGrowthGraph` are the write paths; the rollups are queries. Architect proof storage so cross-tenant aggregation is *possible later* (workspace-scoped now, network-aggregatable shape) without committing to it now.

---

## 7. The Builder — composing growth levers

Honors **Section 4.1 LOCKED** in full. The Builder is not a wizard. It is **one live record with the guest's page rendered live beside the controls** — what the operator edits, the operator sees, as the guest will see it. No setup wizard, no "step 3 of 7," no publish-blocking required-field wall.

### 7.1 The screen (desktop-first, the law)

Split view. **Left: live guest page preview** (the actual render, not a mock). **Right: the control rail**, progressively disclosed:

- **Core (always visible, one screen, smart-defaulted):** title, date/time, location (with gated-address toggle — full address unlocks only at Open), cover, **Access** (where the Gate lives).
- **Advanced (revealed on demand, never blocks publish):** capacity/waitlist, co-hosts, series/recurrence, per-condition thresholds & human-review toggle, social-proof controls, confirmation content (the welcome screen).

**Target: 60–90 second happy path to a publishable draft.** Smart defaults for everything. Never "all fields required" (Posh anti-pattern, banned).

### 7.2 Composing the Gate — chips that build a sentence

The operator is **building a sentence**, and the chips are the words. "To get in, you must **pay $25** and **answer a few questions**." Or "To get in: do **any 1 of** {**follow us**, **be referred**, **pay $25**}."

- Empty state = **"Open — anyone can get in"** (the simplest lock: zero tumblers).
- **+ Add requirement** → picker of available Condition types (only those with live verifiers), each a one-line human description. Picking one drops a **chip** and reveals its config inline (rendered from `configSchema`), plus its **honesty badge** ("Pay $25 — *verified by Stripe*" / "Bring a record — *they promise, confirmed at the door*").
- **Nesting is one gesture:** select two chips → **"make these a choice"** wraps them in an `ANY` group (a parenthesis in the sentence). Ungroup flattens them. The operator is adding parentheses, not editing a tree widget.
- **Depth capped at 2 in the UI** (root group + one level of subgroups). The engine supports arbitrary depth; the Builder refuses to draw past 2, so it can't become Zapier-filter hell. Cap can lift later without touching the engine. **Two levels expresses every real gate** ("pay AND (follow OR refer)" is depth 2).
- The **satisfaction rule** sits above each group as plain English with live preview: "Guests must satisfy **[all / any 1 of / enough of]** these." Default `ALL`.
- The **live preview on the left** shows exactly what a guest faces — tumblers in guest language, CTA, what's gated. The operator never has to imagine the boolean; they read the sentence and see the page. No enum, no JSON, ever (no-raw-enum law, design-token law).

**Reframe for v3:** the chips aren't access conditions, they're **growth levers.** The Builder asks not "who gets in" but "how does this room earn its next member." Grow by referral (bring-a-qualifier), by revenue (pay), by reach (share-tracked-link), by retention (attendance-reputation). That should read in how the Builder talks.

### 7.3 Dead-simple path & templated gates

- New resource → Access defaults to **Open**. One chip away from a working paid event (add PAY, set price, done).
- **"Duplicate last event"** (locked, one click) carries cover, branding, the full Gate tree, questions, optionally the guest segment.
- **Recurring series** first-class: the Gate composes once, instances inherit, per-instance override allowed.
- **Templated gates** — 3–4 named starting points: "Open RSVP," "Paid ticket," "Apply to attend," "Members + paid." Each is a pre-stacked tree. These four reproduce today's hardcoded forks **as data**, proving the engine subsumes the special-cases.

### 7.4 Cmd+K is the spine (locked) + the agent plugs into the same action layer

Every Builder action is in the command layer. **There is ONE gate-mutation action API; three things drive it — UI chips, Cmd+K, and the agent.** No parallel path. Plain-English/voice routes to the same actions the keyboard uses (models: Superhuman, Linear, Raycast).

### 7.5 Mobile (operator)

Deep gate-building stays desktop-first (locked). Operator mobile covers day-of (check-in scan, name search, live count, guest lookup, send-blast) **plus the live approval queue** for any human-review Condition — the operator approving from their phone IS the watchlist gate for launch.

---

## 8. The guest experience — the lock as ritual

Honors **Section 4.2 LOCKED.** Mobile-first, cinematic cover, editorial type, one primary action above the fold. The Gate reshapes the page; it does not turn it into a form.

### 8.1 The feeling

Not a checkout. Not a survey. A **threshold.** Satisfying each tumbler reveals a little more — the guest is being *let in*, progressively, and the act of revealing themselves IS the value exchange. Quiet-luxury logic, not Luma-cold, not Partiful-chaotic. The application is the checkout; the ticket is the receipt of a thing that already happened emotionally.

### 8.2 How a multi-tumbler / nested gate renders

- **Above the fold:** cover, title, one primary action whose label is shaped by the gate ("Request access," "Get your ticket — $25," "Apply to attend"). **Full price upfront, always** (DICE lesson, locked).
- **Below:** the tumblers in guest language, as a **sequence of revealed steps**, not a wall of fields. A nested gate reads as a sentence with sub-choices ("do any of: follow, be referred, or pay; and also answer a few questions") — the boolean rendered as plain English, never as logic. Each satisfied tumbler visibly clicks (a seal forming, not a gamified progress bar).
- **Order is the guest's** unless a Condition declares a dependency (can't pay before approved, if the operator set apply-then-pay). The engine resolves ordering; the guest sees what's available now.
- **Gated details** (exact address, lineup, real who's-coming) unlock only at Open — exclusivity lever, locked.
- **Returning member:** tumblers they've already satisfied show as **already-clicked from their history** (attended-prior auto-passes, prior answers carry per policy, known membership carries). One-tap to Open if nothing new is required (zero re-entry, locked).

### 8.3 Open — the emotional peak

When the tree evaluates true: **confirmation as welcome, not receipt** (locked). Address now revealed, dress code, who's coming. The peak moment, designed — not a Stripe success page. The ticket/QR is present but secondary to the welcome.

### 8.4 No dead ends

If a guest can't satisfy a gate (members-only, not a member), the page shows a **clear state with a path** (apply to the membership) — never a flat "denied" (locked members-only behavior).

---

## 9. The ANSWER_QUESTIONS condition reuses the scoring model (don't rebuild it)

The existing scoring model (`NoBadOS__spec__apply-scoring-model`: 22 scored questions, 4 dimensions, 6 archetypes, single Sonnet `generateObject` in `lib/scoring.ts`) **becomes the verifier for the ANSWER_QUESTIONS condition.** No new scoring system.

- The operator's question set for a resource is that condition's config. Default = the workspace's default template (the 22-question form). Per-resource custom question sets (AI-suggested, operator-approved) are deferred.
- `verify()` runs the scoring call, returns score + archetype + `needsHuman`.
- **The auto-admit-vs-human-review decision is a per-condition setting**, exposed as one operator toggle: **"Review each applicant" vs "Auto-admit above [score]."** July 11 + early events: human-review on (Chloe's eye on every application IS the watchlist gate). At scale: set a threshold. (Resolves the open decision by making it a setting, not a hardcode.)
- `sponsorRelevance` stays orthogonal, never shown to sponsors; archetypes stay internal/member-facing only (sponsor-intelligence law honored).
- **Frozen-zone discipline:** the condition WRAPS the application flow; it never edits `handleSubmit` / `patchAndAdvance` / `generateShareCard` / consent-TCPA / scoring internals.

---

## 10. Agentic gate creation (the agent IS the OS)

Master-spec founding principle: every platform action is executable through the agent in plain English/voice; the agent is the front door for everything non-spatial. **The agent composes gates through the exact same action layer the chips and Cmd+K use.**

Examples Adam should be able to say:
- "Make a Saturday event July 11 at Chateau Chloe, $25 or apply, and let people skip the line if they follow us on Instagram." → agent assembles a depth-2 tree: GROUP(ANY_1)[ PAY(2500), ANSWER_QUESTIONS, FOLLOW_INSTAGRAM ] → returns the draft with live preview for Adam to eyeball and publish.
- "Add a requirement that they be referred by a member." → appends `REFERRED_BY_MEMBER`.
- "Turn off the questions, just make it paid." → removes `ANSWER_QUESTIONS`, leaves PAY.

Guardrails (from `runAgentTurn` in `lib/agent-model.ts` — write-tool gate, `[CONFIRM]` affirmation regex): the agent **cannot add a Condition type whose verifier isn't live** (the action layer enforces it, so neither UI nor agent can bypass the rule). The agent proposes; Adam's `[CONFIRM]` + publish are the gate.

---

## 11. Data model (additive only — the law)

All additive. No `prisma db push`. Schema edit → `prisma generate` → `migrate diff` → `prisma db execute` with exact reviewed SQL → Adam runs it in Neon (dry-run first). No Condition type ships before its verifier + migration are live.

### 11.1 New tables (proposed shape — CC refines against live schema)

```
Gate
  id
  resourceType  enum(EVENT | MEMBERSHIP_TIER | CONTENT | PERK)
  resourceId    string            // polymorphic — NOT a hardwired eventId
  rootNodeId    FK -> GateNode    // the tree root
  workspaceId   FK                // security boundary, always scoped
  createdAt, updatedAt
  UNIQUE(resourceType, resourceId) // one gate per resource in v3

GateNode
  id, gateId (FK)
  parentId      FK?               // null = root
  kind          enum(GROUP | CONDITION)
  // GROUP:
  rule          enum(ALL | ANY_N | WEIGHTED)?
  ruleThreshold int?
  // CONDITION (leaf):
  type          string?           // registry key
  config        jsonb?            // validated against the type's configSchema
  required      bool
  weight        float?
  order         int
  dependsOnId   FK?               // optional ordering dependency (apply-before-pay)

GateProof
  id
  nodeId (FK)                     // the CONDITION leaf satisfied
  memberId (FK)
  resourceType, resourceId        // denormalized for fast carry-forward
  satisfied     bool
  tier          enum(TIER1|TIER2|TIER3)
  proofMechanism enum(VERIFIED|API|ATTESTED|EVIDENCE|DOOR)
  score         float?
  evidence      jsonb             // payment_intent id, IG callback, answers ref, transcript, upload url
  verifierResult jsonb
  needsHuman    bool
  resolvedByUserId FK?            // human approver
  createdAt
  UNIQUE(nodeId, memberId)        // one live proof per condition per member; re-verify updates

GrowthEdge                        // the growth graph
  id, workspaceId
  kind          enum(REFERRAL | PLUS_ONE | ...)
  fromMemberId  FK                // who grew the company
  toMemberId    FK?               // the net-new member, if any
  proofId       FK
  resourceType, resourceId
  createdAt

GateSession                       // a guest's in-progress attempt
  id, gateId (FK), memberId (FK?), guestEmail?
  state         enum(OPEN_PROGRESS | PENDING_REVIEW | OPENED | BLOCKED)
  openedAt?
```

- **Carry-forward** is a query: on landing, look up existing `GateProof` by `memberId` + condition type and pre-satisfy anything still valid (attended-prior always; membership always; prior answers per policy window; IG-follow re-checked live).
- **The two-source-of-truth price drift dies here:** price is a `PAY` condition's `config.priceCents` — single authoritative location. Legacy `eventAccess.guest.priceCents` and `TicketTier` migrate into a PAY condition, then freeze/retire. (Backlog item resolved.)
- **Cross-tenant readiness:** `GrowthEdge` and `GateProof` are workspace-scoped now but shaped so network-level aggregation is *possible later* without schema surgery — do NOT build cross-tenant reads in v3.

### 11.2 Migration of existing events

Launch event (`cmqr8wojk000004kzc90yxxy3`) + future pre-v3 events get a one-time backfill: read current `eventAccess` jsonb → synthesize a Gate (root GROUP, rule ALL or ANY per current mode) with a PAY condition (priceCents 2500) and the apply flow as an ANSWER_QUESTIONS condition. **Additive and reversible; old jsonb stays readable until the Gate read-path is proven in prod.** Ships AFTER July 11 — the launch event runs on the current live path; the engine replaces it next.

---

## 12. The five proof-of-flexibility example gates (carried from strategy)

Chosen to span every tier and prove the engine isn't "social media tasks":

1. **Answer one provocative question well** (Tier-3 AI-attested) — one question, scoring-model-judged; a lightweight taste filter without the full 22-question commitment. Proves the scoring engine works at any granularity.
2. **Bring a qualifying plus-one** (Tier-1 closed-loop) — opens only when the invitee also completes the gate; provable because both flow through platform-minted links. The room curates itself; verifiable viral growth.
3. **Hold a membership OR pay the door** (nested OR, Tier-1) — the most common real-world access pattern; a depth-2 gate by nature; proves nesting earns its keep day one.
4. **Upload proof you did the thing** (Tier-3 evidence + human review) — the universal escape hatch; one condition type covers an infinite long tail because the human is the verifier; the honest version of every un-API-able social ask.
5. **Attendance-reliability reputation** (Tier-1 closed-loop, anti-flake) — passive check of RSVP→check-in history; reliable attendees auto-pass, serial no-shows route to review or a deposit. A reputation primitive **only the platform that owns the whole loop can build** — the moat made concrete.

---

## 13. Build sequence (milestones — each its own gated CC prompt, all AFTER the July 11 blast)

Nothing here ships before July 11. The launch event runs on the current live path. This is the next platform milestone after blast.

1. **M1 — Engine core + 5 Tier-1/3 verifiers, headless.** Tables (additive migration, Adam runs SQL), the GateNode tree, the recursive evaluator, the ConditionType contract + registry, the v3-M1 verifiers (PAY, ANSWER_QUESTIONS, REFERRED_BY_MEMBER, ATTENDED_PRIOR, HOLD_MEMBERSHIP), GateProof carry-forward, GrowthEdge write path. No UI. Tested with seeded nested gates. **Gate to M2: a nested gate is satisfied end-to-end in a test, proofs persist with correct tier, carry-forward works, a REFERRAL edge is written.**
2. **M2 — Guest gate render.** The `/e/` page renders a Gate tree from data instead of the hardcoded fork. The four templated gates reproduce today's behavior as data. **Gate to M3: the launch-style paid+apply gate renders and opens correctly in prod-shaped data; payments work (the route fix holds).**
3. **M3 — Builder split-view + chip/tree composer.** Live preview + control rail + chips + the make-these-a-choice grouping gesture (depth-2 cap) + the satisfaction-rule sentence + honesty badges + smart defaults + duplicate-last-event. Desktop. **Gate to M4: Adam composes a real nested gate in <90s and publishes.**
4. **M4 — Backfill + cutover.** Migrate existing events' `eventAccess` into Gates; flip the read path; freeze legacy price fields. Reversible. **Gate to M5: launch event + all events read from Gates; legacy jsonb retired from the charge path.**
5. **M5 — Cmd+K + agent composition.** Wire the one gate-mutation action layer to Cmd+K and the agent. **Gate: Adam composes a gate by voice/text with `[CONFIRM]`.**
6. **M6 — v3.1 verifiers** (bring-qualifying-plus-one, attendance-reputation, evidence-upload, IG follow, share-tracked-link, refer-someone, LinkedIn, voice-note), each behind its own verifier-live gate. Approval-queue mobile for human-review conditions. Per-member + per-company growth rollups surfaced.

Phase 2 (research-gated): HOLD_TOKEN, WEBHOOK, gate-any-resource beyond EVENT (membership tiers / content / perks live UI), the cross-tenant trust graph, multi-gate-per-tier.

---

## 14. Explicitly deferred (named, not built in v3)

- **Cross-tenant trust graph** — architect proof storage to *allow* it; do not build cross-tenant reads. Privacy + cultural viability is a research question.
- **Gating non-event resources in the UI** — the data model is polymorphic now; the Builder UI for gating membership tiers / content / perks is Phase 2.
- **Multi-gate-per-tier** — different tumblers for GA vs VIP on one resource. v3 is one Gate per resource; the model leaves room.
- **Token / webhook verifiers** — Phase 2.
- **Per-resource AI-authored question sets** — operator-approved AI question generation; v3 uses the default 22-question template.
- **Nesting beyond depth 2 in the UI** — engine supports it; UI cap lifts later if ever needed.
- **Gate analytics** (drop-off per tumbler, conversion by condition) — post-cutover.

---

## 15. Laws every CC prompt must honor (checklist)

- Additive schema only. `prisma db push` BANNED. `node node_modules/prisma/build/index.js`, never npx. Adam runs every prod DB op in Neon, dry-run first.
- No Condition type in the Builder or to the agent until its verifier + migration are live and tested.
- Frozen zones never edited: MembershipForm (handleSubmit, patchAndAdvance, generateShareCard, consent-TCPA, scoring), existing gate engine internals, buildSteps, EventAccessFlow internals, config/archetypes.ts. ANSWER_QUESTIONS WRAPS the application flow; never edits its internals.
- Workspace is the security boundary; everything workspace-scoped; no cross-tenant read in v3.
- Design tokens only, no raw hex (white-label). No raw enum values in any UI copy. "Access" not "RSVP." "NoBC" never "NBC." Spaced hyphens, never em-dashes.
- One CC writer per repo. Plan-first, approval-gated CC prompts in 7-backtick wrappers with explicit branch, frozen zones, forbidden ops, mandatory structured report.
- Ground truth is the live artifact (rendered page, Neon row, Stripe dashboard), never a code-read.
- Nothing merges or deploys without Adam's explicit sign-off. Agent mutations require `[CONFIRM]`.

---

## 16. Open decisions for Adam (the genuine judgment calls)

1. **Satisfaction-rule expressivity** — confirm flat-rules-plus-depth-2-nesting is the v3 ceiling (my rec, locked in this draft), or do you want deeper nesting / nested-group weights in v3? Deeper is where "dead simple" dies.
2. **Auto-admit threshold for July-era events** — confirm human-review-on through the first ~10 events, and name the score line where auto-admit turns on later.
3. **Templated gates** — confirm the four (Open / Paid / Apply / Members+Paid), or name others.
4. **Carry-forward validity windows** — my rec: attended-prior never expires; membership always; payment per-event always; answers carry 12 months then re-ask; IG-follow re-checked live. Mark changes inline.
5. **REFER_SOMEONE / plus-one credit** — bank credit for a future gate vs retro-open the current resource. My rec: bank it (feeds profile + a future gate), don't retro-open.
6. **Cross-tenant trust graph** — confirm it stays research-gated and v3 only makes the data *shape-ready*, not network-readable. (My rec: yes.)

---

## 17. What this unlocks

One engine replaces three hardcoded forks and everything between them, then generalizes to gate any resource. The operator builds a sentence, sees the guest's exact view, ships in 90 seconds — and is really composing a growth strategy (grow by referral / revenue / reach / retention). The guest feels a threshold open, not a form submit. Every gate interaction enriches the member profile and the growth graph forever; returning guests carry proof forward. The agent composes gates through the same action layer the UI uses. The system is honest about how solid each proof is. Any tenant composes their own access logic from an open registry without us touching their code — and the proofs are shaped to become a cross-tenant trust moat when the market proves it should. The price-drift, the apply-stapled-on, the payment-route special-case all dissolve into one primitive.

That's the lock. The operator picks the tumblers. The guest makes them click. The door opens. And every click grew the company.
