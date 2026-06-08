# Slice 2 — Member Field Editing (F4 + F5) — Plan (for review)

_Planning doc only. No code in this file. Grounds the F4 (inline edit) and F5 (add/edit field definitions) design in the real Slice-0/1 read-path and the existing PR2 write-path, mapped read-only from the codebase. Author: away-session. Status: **draft — awaiting review.**_

---

## 1. Why this exists

Slice 1 delivered the **read** experience (F1 identity/status, F2 timeline, F3 provenance badges). Slice 2 makes the record **editable**:

- **F4 — inline edit:** an operator changes a member's dimension field value in place on the record page, with the edit provenance-stamped as a manual operator edit.
- **F5 — add/edit fields:** an operator defines *which* fields exist (label, type, options, section) — i.e. brings the dormant `FieldDefinition` registry to life so custom fields are first-class, not free-floating JSON keys.

The headline finding from the read-only investigation: **most of F4 already exists.** The server write-path, the optimistic client mutation, the provenance stamping, and the cache priming were all built in PR2/PR3 (Slice 0). F4 is therefore overwhelmingly a **UI** slice. F5 is greenfield UI + CRUD over a **model that already exists**, so it too needs **no schema change**.

---

## 2. Grounding — what already exists (confirmed read-only)

| Capability | Where it lives | State | Slice 2 uses it |
|---|---|---|---|
| Provenance write API | `PATCH /api/operator/members/[id]/route.ts` | **Built.** STAFF+ gate, `applyFieldWrites` stamps `{value,source,confidence,syncedAt}` into `customFields`/`fieldProvenance`, refuses merged records (409), emits `member.fields_updated` audit; sync sources also append an `enrichment_synced` engagement event | ✅ F4 calls it as-is |
| Typed fetcher + mutation | `lib/member-client.ts` (`patchMemberFields`, `optimisticApplyFieldWrites`, `FieldWriteInput`, `memberKeys`) | **Built.** Pure, dependency-free; optimistic merge reuses the *same* `applyFieldWrites` as the server; **source defaults to `operator_entered`** | ✅ F4 reuses |
| Optimistic mutation hook | `lib/hooks/usePatchMemberFields.ts` | **Built.** `onMutate` optimistic patch → `onError` rollback → `onSettled` invalidate, against `memberKeys.record(id)` | ✅ F4's write engine |
| Record query hook | `lib/hooks/useMemberRecord.ts` | **Built.** Accepts `initialData` (the RSC-assembled record) so the island hydrates without a refetch and the cache is primed for the mutation | ✅ F4 reads from cache |
| TanStack Query | installed; provider in `app/providers.tsx` | **Wired** (Slice 1 added `@tanstack/react-query` + `react-virtual`) | ✅ mutations already supported |
| Field definitions | `model FieldDefinition` (`workspaceId, stableKey, name, type, section, sponsorVisible, options[], order, isActive`, `@@unique([workspaceId, stableKey])`) | **Dormant.** Model exists; **zero `db.fieldDefinition.*` reads or writes anywhere** in `app/`/`lib/`. The record renders raw `customFields` keys via `humanizeKey` | ✅ F5 activates it — no schema change |
| Application form builder | `QuestionDefinition` + `PATCH /api/operator/settings/application` + `ApplicationFormEditor.tsx` | **Built** — but this is the **application/registration** registry (`section='application'`, scoring fields), **distinct from `FieldDefinition`** | 🔎 reference pattern for F5's CRUD, not the same model |

**Two registries, do not conflate:**
- `QuestionDefinition` → the `/apply` form questions (scoring, archetype signals). Managed today. Out of scope.
- `FieldDefinition` → member **dimension/custom fields** (`sponsorVisible` firewall flag, `options`, `section`). Dormant. **This is what F5 is about.**

**The C3 decision still holds:** first-class Member columns (`companyName`, `seniority`, `city`, …) are **read-only profile facts in PR3**. The existing PATCH path only ever writes `customFields`/`fieldProvenance` — never first-class columns — so F4 inline-edit targets the **Fields card (customFields)**, and the **Profile card stays read-only** unless Adam re-scopes (open question Q1).

---

## 3. F4 — inline edit (design)

### 3.1 Editable scope
- **In scope:** `customFields` entries (the Fields card) — exactly what the PATCH path writes and stamps.
- **Out of scope (PR3, per C3):** first-class Profile columns. Read-only.
- **Never editable / never shown:** `archetype`, `archetypeScores`, anything psychographic. The PATCH path writes arbitrary `stableKey`s into `customFields`; F4/F5 must **reserve** `archetype`/`archetypeScores` keys (reject in validation) so an operator can never shadow-write archetype onto the operator surface. Psychographics stays in its own `MemberPsychographics` table, untouched by this slice.

### 3.2 Affordance (density-agnostic — see §5)
- Each Fields-card row becomes click-to-edit: value → inline control on click/focus, **Save on Enter/blur, Esc to cancel**. No modal for the common case.
- Control by field type (from `FieldDefinition.type` once F5 lands; before that, infer text): `text`/`url` → input, `textarea` → multiline, `select` → option list (`FieldDefinition.options`), `checkbox` → toggle.
- The **`ProvenanceBadge` stays visible** beside each field; after a manual edit it reflects the new `operator_entered` source.
- An **"Add value"/"Edit"** affordance appears only for STAFF+ (§3.6).

### 3.3 Optimistic vs server-confirmed
- Reuse `usePatchMemberFields` **as-is**: optimistic patch on submit → rollback on error → invalidate on settle. The user sees the new value immediately; a failed write reverts and surfaces the `MemberApiError` message.
- No new mutation, no new endpoint.

### 3.4 Provenance of a manual edit
- A manual operator edit **is itself a provenance source**: `source: 'operator_entered'` (already the `optimisticApplyFieldWrites` default and the natural PATCH input). The badge then renders "Operator" (neutral tone) via `provenanceMeta`.
- `confidence` is omitted for manual edits (only `ai_inferred` carries it).
- **Server is source of truth for `syncedAt`** — the optimistic stamp is cosmetic; `onSettled` reconciles to the server's value.

### 3.5 Validation
- Client: type-appropriate (URL shape for `url`, option-membership for `select`, non-empty unless the field is nullable), mirroring `patchMemberSchema` (`fields` record, key 1–120 chars, value = scalar | string[]).
- Server already enforces `patchMemberSchema` + the merged-record 409 — the client just pre-empts the round-trip and shows inline errors.
- Reserved-key rejection (§3.1) lives in **both** the client control and a server guard added to `patchMemberSchema` (small, additive, in scope for 2A).

### 3.6 Role + state gating
- Edit affordances render **only for STAFF+**. The RSC already computes `roleAtLeast(role, OperatorRole.STAFF)` (for `includePsychographics`); thread that same boolean into the Fields card as an `editable` prop. READ_ONLY sees values, no controls. (UI gate is UX; the PATCH STAFF gate remains the real boundary.)
- **Merged records:** `MemberRecordHeader` already shows "editing is disabled here" when `mergedIntoId` is set, and PATCH returns 409. F4 must **disable all edit affordances** when `record.member.mergedIntoId` is set — match the existing copy, don't duplicate the banner.

### 3.7 Firewall posture
- F4 writes only to `customFields` (operator surface). It never reads or writes `MemberPsychographics`. New custom fields created via F5 default `sponsorVisible:false`, so they're firewalled from the sponsor aggregate until explicitly opted in — F4 editing such a field never changes that flag. The sponsor-firewall test stays the gate and is unaffected (no sponsor-file tokens touched).

---

## 4. F5 — add/edit field definitions (design)

### 4.1 What it is
Activate `FieldDefinition` as the member-field registry: an operator can **create, rename, retype, reorder, soft-deactivate, and set sponsor-visibility** of the dimension fields that appear on every member record. Today those fields exist only implicitly as whatever keys happen to be in `customFields`; F5 makes them declared and labeled.

### 4.2 Schema change? **NO.**
`FieldDefinition` already carries everything F5 needs:

| Need | Column | Present |
|---|---|---|
| Display label | `name` | ✅ |
| Control type | `type` (`text\|textarea\|select\|url\|checkbox`) | ✅ |
| Grouping/partition | `section` | ✅ |
| Select choices | `options String[]` | ✅ |
| Firewall opt-in | `sponsorVisible Boolean @default(false)` | ✅ |
| Ordering | `order` | ✅ |
| Soft-delete (preserve values) | `isActive` | ✅ |
| Stable identity / upsert key | `stableKey` + `@@unique([workspaceId, stableKey])` | ✅ |

So F5 is **additive-zero on schema** — it builds CRUD + UI over the existing model, mirroring how `PATCH /api/operator/settings/application` manages `QuestionDefinition` (soft-delete on removal, stableKey minted from a slug, audit event). A member field that's deactivated keeps its `customFields` value (history preserved), exactly like the question builder.

### 4.3 If Adam wants something `FieldDefinition` can't express (only then)
If F5 needs a capability the model lacks — e.g. a per-field **validation rule**, a **default value**, a **"required on member record"** flag, or a member-vs-application **namespace** beyond what `section` gives — that's a new **additive column**. The required path (never `prisma db push`):
1. Edit `prisma/schema.prisma` (add nullable/defaulted column).
2. `prisma generate` (via `node node_modules/prisma/build/index.js` — `npx prisma` is broken here).
3. `prisma migrate diff … --script` → **review the SQL**, refuse any DROP/ALTER TYPE/RENAME.
4. `prisma db execute --file <migration.sql>` against the direct URL. Never `db push`, never `--accept-data-loss`, never touch `Asset_searchVector_idx`.

Default recommendation: **no column** — `section` partitions member vs application fields, and "editable/visible on the record" can be expressed with the existing flags. Decide via Q3.

### 4.4 CRUD surface (proposed, mirrors the question builder)
- `GET/PATCH /api/operator/settings/member-fields` (ADMIN, matching the question-builder's ADMIN gate) — list + batch upsert/soft-delete `FieldDefinition` rows for `section in (member sections)`, audit `settings.member_fields_updated`.
- A settings editor component modeled on `ApplicationFormEditor.tsx` (add row, rename, pick type, set options, toggle `sponsorVisible`, drag-reorder, deactivate).
- **Wire the record to the registry:** the Fields card renders each `customFields` entry by its `FieldDefinition` (`name` as label, `type` as the F4 control, `options` for selects), falling back to `humanizeKey` for any key without a definition (so nothing regresses). This requires `assembleMemberRecord` (or the card) to load the workspace's active `FieldDefinition`s — an additive read, no shape break to `MemberRecord` (carry them as a sibling field, e.g. `fieldDefs`, or fetch in the card).

### 4.5 Firewall posture
- New fields are `sponsorVisible:false` by default → firewalled until an admin opts a field in. The sponsor aggregate's documented contract ("already filtered to `FieldDefinition.sponsorVisible`") finally has a producer. F5 must **never** allow a `sponsorVisible:true` field whose `stableKey` is psychographic/reserved; reserved-key rejection (§3.1) applies here too.

---

## 5. Density-agnostic affordance design (Slice 1 layout still under review)

Slice 1's visual density (editorial vs CRM-dense) is **not yet locked**. F4/F5 affordances must not hard-couple to the current 2-column card layout:

- Express edit state as a **per-field primitive** (an `EditableField` that takes `{def, value, provenance, editable, onSave}`), not a layout assumption — it drops into a dense table row or an editorial card unchanged.
- Keep the **provenance badge + label + control** as one composable unit so re-flowing the page (e.g. to a denser grid) doesn't touch edit logic.
- No fixed widths/heights tied to the current card; inherit from the container. Tokens only (§6).
- The Save/Esc/blur interaction and the optimistic hook are **layout-independent** — they survive any density decision. Whatever Adam lands on changes *where* `EditableField` renders, not *how* it edits.

---

## 6. Locked constraints honored

- **Design tokens only, no hex.** Edit controls use existing tokens (`bg-surface`/`bg-raised`, `border-border(-strong)`, `text-text-*`, `text-primary`, the tone-soft fills). No new color literals.
- **Locked terminology.** "Registration fields" stays the **application** form's name; member fields are **"Fields"/"Member fields"** (the record's existing card label). Never "RSVP"; engagement labels stay human (`engagementMeta`). Member/Guest/Comp Access unchanged.
- **Do not touch** `MembershipForm.tsx`, `config/archetypes.ts`, `tagApplication`, or any scoring path. F5's CRUD is over `FieldDefinition` only and never re-scores.
- **No `prisma db push`**; additive-only migrations via the §4.3 path *if* a column is ever needed (default: none).
- **Sponsor firewall stays green** — `tests/unit/sponsor-firewall.test.ts` is the gate; no psychographic tokens enter sponsor files; new fields default `sponsorVisible:false`.
- **Report-don't-fix** pre-existing lint on touched files.

---

## 7. Proposed sub-slice breakdown

Slice 2 is two cleanly separable units; ship **2A then 2B**.

- **Slice 2A — F4 inline edit (UI-only over the existing write path).** `EditableField` primitive + Fields-card wiring + STAFF/merged gating + reserved-key guard (client + a small server `patchMemberSchema` addition) + tests. **No new endpoint, no schema, no new dependency.** Smallest, highest-value, independently shippable and reviewable.
- **Slice 2B — F5 field management (activate `FieldDefinition`).** Member-fields CRUD route + settings editor + record-renders-by-definition wiring + tests. Larger; depends on 2A's `EditableField` (so the typed control is reused). **No schema change** (unless Q3 says otherwise).

Each sub-slice: green (`tsc` 0 + `next build` Errors:0 + eslint clean on touched files) before commit; atomic commit; STOP for review before the next.

---

## 8. Open questions for Adam

1. **Q1 — First-class columns:** keep Profile columns (`companyName`, `seniority`, `city`, …) **read-only** in Slice 2 (C3 as written), or make them inline-editable too? Editing them needs the PATCH route extended to whitelist real columns (still **no schema change**) and a provenance story for column writes. *Recommend: read-only this slice; revisit in a later slice.*
2. **Q2 — Add-value affordance:** should F4 allow setting a value for a **defined-but-empty** field (a `FieldDefinition` with no `customFields` entry yet), or only edit fields that already have a value? *Recommend: yes, show all active member `FieldDefinition`s as editable rows once F5 lands; pre-F5, only existing keys.*
3. **Q3 — F5 scope / schema:** is the existing `FieldDefinition` shape sufficient (recommended — **no schema change**), or do you want a per-field capability it can't express (validation rule, default value, "required on record")? Only that answer triggers the §4.3 additive-column path.
4. **Q4 — Who manages fields:** F5 CRUD gated at **ADMIN** (matching the application-form builder) or **STAFF**? *Recommend: ADMIN — field schema is a workspace-shape decision.*
5. **Q5 — Reserved keys:** confirm the reserved/blocked `stableKey` set is exactly `{archetype, archetypeScores}` (plus anything psychographic), rejected on both write and definition. *Recommend: yes.*
6. **Q6 — Sequencing vs density review:** build 2A now against Slice 1's current layout (the `EditableField` primitive is layout-independent, §5), or wait for the editorial-vs-dense decision? *Recommend: build 2A now — it's decoupled from layout.*

---

## 9. Out of scope (this slice)

- First-class column editing (pending Q1).
- The `/apply` form, `QuestionDefinition`, `MembershipForm.tsx`, scoring, `config/archetypes.ts`.
- Any psychographics editing or surfacing.
- Bulk field edits / import.
- A schema change (unless Q3 explicitly opts in).
- The Slice 1 read components' visual density (separate review; §5 keeps F4/F5 compatible with either outcome).
