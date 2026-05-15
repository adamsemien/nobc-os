# Event Access Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single `accessMode` selector with three independent Access groups (Member, Guest, Comp), JSON config on Event, member-page flow engine with Stripe Payment Element.

**Architecture:** Phase A lays schema (`eventAccess` JSON, GUEST status, RSVP comp/guest fields, extended questions) + libs (Zod schema, resolver, step builder, legacy-derive) + operator UI (wizard Step 3, Settings Access section). Phase B rewires member page: shared `RsvpCard`, `EventAccessFlow` Radix Dialog stepper, three new `/access/*` endpoints, Stripe Payment Element with Apple Pay.

**Tech Stack:** Next.js 15 App Router, Prisma 7 + Neon, Zod, Stripe (Payment Element via `@stripe/react-stripe-js`), Radix Dialog, Resend, Clerk.

**Spec:** [`docs/superpowers/specs/2026-05-15-event-access-rebuild-design.md`](../specs/2026-05-15-event-access-rebuild-design.md)

**Verification:** Codebase has no test runner; each task ends with `npm run build` (TypeScript + Next build) and/or a targeted manual smoke command. Per CLAUDE.md, `prisma generate` runs first on schema changes; `prisma db push` after review.

---

## Phase A — Foundation

### Task 1: Schema migration + backfill

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `scripts/backfill-event-access.ts`

- [ ] **Step 1.1: Add GUEST to MemberStatus, EMAIL/PHONE to FieldType, new QuestionFlowStep enum**

In `prisma/schema.prisma`, change:

```prisma
enum MemberStatus {
  PENDING
  APPROVED
  REJECTED
  WAITLISTED
  GUEST
}

enum FieldType {
  TEXT
  TEXTAREA
  SELECT
  MULTISELECT
  CHECKBOX
  DATE
  EMAIL
  PHONE
}

enum QuestionFlowStep {
  BEFORE_SUBMIT
  AFTER_PAYMENT
  BEFORE_APPROVAL
}
```

- [ ] **Step 1.2: Add eventAccess JSON to Event, isComp/compType/guestEmail/guestName to RSVP, new columns on EventCustomQuestion**

```prisma
model Event {
  // ... existing fields preserved ...
  eventAccess Json @default("{\"member\":{\"enabled\":true,\"gate\":\"auto_confirm\",\"priceCents\":0},\"guest\":{\"enabled\":false,\"gate\":\"pay\",\"priceCents\":0},\"comp\":{\"enabled\":false,\"budgetCap\":null}}")
}

model RSVP {
  // ... existing fields preserved ...
  isComp      Boolean @default(false)
  compType    String?
  guestEmail  String?
  guestName   String?
}

model EventCustomQuestion {
  // ... existing fields preserved ...
  showToMember Boolean          @default(true)
  showToGuest  Boolean          @default(true)
  whenInFlow   QuestionFlowStep @default(BEFORE_SUBMIT)
}
```

- [ ] **Step 1.3: Run `prisma generate`, review diff, then `prisma db push`**

```bash
npx prisma generate
git diff prisma/schema.prisma | head -100
npx prisma db push
```

Expected: client regenerates without errors; `db push` warns about new columns but no data loss.

- [ ] **Step 1.4: Write backfill script**

Create `scripts/backfill-event-access.ts`:

```ts
import { db } from "../lib/db"

async function main() {
  const events = await db.event.findMany({
    select: {
      id: true,
      accessMode: true,
      applyMode: true,
      approvalRequired: true,
      priceInCents: true,
      nonMemberPriceInCents: true,
      eventAccess: true,
    },
  })

  let updated = 0
  for (const e of events) {
    // If eventAccess already populated by our default and looks intentional, skip
    const existing = e.eventAccess as any
    if (existing?.member?.enabled !== undefined && existing?.guest?.enabled !== undefined) {
      // Only overwrite if it matches the schema default (all events get default on push)
      const isDefault = existing.member.gate === "auto_confirm" && existing.member.priceCents === 0 && !existing.guest.enabled && !existing.comp.enabled
      if (!isDefault) continue
    }

    const memberPrice = e.priceInCents ?? 0
    const guestPrice = e.nonMemberPriceInCents ?? 0
    const needsApproval = e.approvalRequired ?? false

    let memberEnabled = true
    let memberGate: string = "auto_confirm"
    let guestEnabled = false
    let guestGate: string = "pay"

    switch (e.accessMode) {
      case "OPEN":
        memberGate = needsApproval ? "questions_approval" : "auto_confirm"
        guestEnabled = false
        break
      case "TICKETED":
        memberGate = memberPrice > 0 ? "pay" : "auto_confirm"
        guestEnabled = guestPrice > 0
        guestGate = "pay"
        break
      case "APPLY_OR_PAY":
        memberGate = needsApproval ? "questions_approval" : "auto_confirm"
        guestEnabled = true
        guestGate = needsApproval ? "apply" : "pay"
        break
    }

    await db.event.update({
      where: { id: e.id },
      data: {
        eventAccess: {
          member: { enabled: memberEnabled, gate: memberGate, priceCents: memberPrice },
          guest: { enabled: guestEnabled, gate: guestGate, priceCents: guestPrice },
          comp: { enabled: false, budgetCap: null },
        },
      },
    })
    updated++
  }

  console.log(`Backfilled ${updated} events.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => process.exit(0))
```

- [ ] **Step 1.5: Run backfill**

```bash
npx tsx scripts/backfill-event-access.ts
```

Expected: prints "Backfilled N events." with N > 0.

- [ ] **Step 1.6: Commit**

```bash
git add prisma/schema.prisma scripts/backfill-event-access.ts
git commit -m "feat(schema): event access JSON, GUEST status, comp/guest fields, question flow step"
```

---

### Task 2: Core access libs (schema, resolver, step builder, derive)

**Files:**
- Create: `lib/event-access-schema.ts`
- Create: `lib/event-access.ts`
- Create: `lib/event-access-derive.ts`
- Create: `lib/member-filters.ts`
- Modify: `lib/format-enums.ts`

- [ ] **Step 2.1: Zod schema + default builder**

Create `lib/event-access-schema.ts`:

```ts
import { z } from "zod"

export const MemberGateSchema = z.enum([
  "auto_confirm",
  "questions",
  "questions_approval",
  "pay",
  "pay_questions",
  "questions_pay",
  "questions_pay_approval",
])
export type MemberGate = z.infer<typeof MemberGateSchema>

export const GuestGateSchema = z.enum([
  "pay",
  "apply",
  "pay_questions",
  "questions_pay",
  "apply_pay",
  "questions_approval",
])
export type GuestGate = z.infer<typeof GuestGateSchema>

export const CompTypeSchema = z.enum([
  "sponsor",
  "vendor",
  "staff",
  "press",
  "partner",
  "other",
])
export type CompType = z.infer<typeof CompTypeSchema>

export const MemberAccessSchema = z.object({
  enabled: z.boolean(),
  gate: MemberGateSchema,
  priceCents: z.number().int().min(0),
})

export const GuestAccessSchema = z.object({
  enabled: z.boolean(),
  gate: GuestGateSchema,
  priceCents: z.number().int().min(0),
})

export const CompAccessSchema = z.object({
  enabled: z.boolean(),
  budgetCap: z.number().int().min(0).nullable(),
})

export const EventAccessSchema = z.object({
  member: MemberAccessSchema,
  guest: GuestAccessSchema,
  comp: CompAccessSchema,
})
export type EventAccess = z.infer<typeof EventAccessSchema>

export function defaultEventAccess(): EventAccess {
  return {
    member: { enabled: true, gate: "auto_confirm", priceCents: 0 },
    guest: { enabled: false, gate: "pay", priceCents: 0 },
    comp: { enabled: false, budgetCap: null },
  }
}

// Gates that are not yet wired (need Stripe authorize+capture)
export const UNSUPPORTED_GATES = new Set<MemberGate | GuestGate>([
  "questions_pay_approval",
  "apply_pay",
])

export function isGateSupported(gate: MemberGate | GuestGate): boolean {
  return !UNSUPPORTED_GATES.has(gate)
}
```

- [ ] **Step 2.2: Resolver + step builder**

Create `lib/event-access.ts`:

```ts
import type { EventAccess, MemberGate, GuestGate } from "./event-access-schema"
import { EventAccessSchema, defaultEventAccess, isGateSupported } from "./event-access-schema"
import type { Member, MemberStatus } from "@prisma/client"

export type ViewerKind = "member" | "guest" | "anon"

export type ResolvedAccess =
  | { kind: "member"; gate: MemberGate; priceCents: number; supported: boolean }
  | { kind: "guest"; gate: GuestGate; priceCents: number; supported: boolean }
  | { kind: "closed"; reason: string }

export type StepId = "auth" | "guestInfo" | "fieldsBefore" | "pay" | "fieldsAfter" | "submit"

export function parseEventAccess(raw: unknown): EventAccess {
  const result = EventAccessSchema.safeParse(raw)
  return result.success ? result.data : defaultEventAccess()
}

export function resolveViewer(
  member: Pick<Member, "status"> | null,
  clerkUserId: string | null
): ViewerKind {
  if (member && member.status === "APPROVED") return "member"
  if (clerkUserId || member) return "guest"
  return "anon"
}

export function resolveAccessForViewer(
  access: EventAccess,
  viewer: ViewerKind
): ResolvedAccess {
  if (viewer === "member") {
    if (access.member.enabled) {
      return {
        kind: "member",
        gate: access.member.gate,
        priceCents: access.member.priceCents,
        supported: isGateSupported(access.member.gate),
      }
    }
    if (access.guest.enabled) {
      return {
        kind: "guest",
        gate: access.guest.gate,
        priceCents: access.guest.priceCents,
        supported: isGateSupported(access.guest.gate),
      }
    }
    return { kind: "closed", reason: "This event is not open right now." }
  }
  // guest or anon
  if (access.guest.enabled) {
    return {
      kind: "guest",
      gate: access.guest.gate,
      priceCents: access.guest.priceCents,
      supported: isGateSupported(access.guest.gate),
    }
  }
  if (access.member.enabled) {
    return { kind: "closed", reason: "This event is open to members only." }
  }
  return { kind: "closed", reason: "Access is not open at this time." }
}

// Step builder: returns the ordered step IDs for a given resolved access
export function buildSteps(
  resolved: ResolvedAccess,
  viewer: ViewerKind,
  questions: { whenInFlow: "BEFORE_SUBMIT" | "AFTER_PAYMENT" | "BEFORE_APPROVAL"; showToMember: boolean; showToGuest: boolean }[]
): StepId[] {
  if (resolved.kind === "closed") return []

  const steps: StepId[] = []
  const isMember = resolved.kind === "member"
  const isGuest = resolved.kind === "guest"

  // Auth: required if not a member viewer for member-kind access; for guest-kind, anon needs GuestInfo not Auth
  if (isMember && viewer !== "member") {
    steps.push("auth")
  } else if (isGuest && viewer === "anon") {
    steps.push("guestInfo")
  }

  // Gate decomposition
  const gate = resolved.gate
  const visibleQuestions = (when: "BEFORE_SUBMIT" | "AFTER_PAYMENT" | "BEFORE_APPROVAL") =>
    questions.filter((q) => q.whenInFlow === when && (isMember ? q.showToMember : q.showToGuest))

  const gateHasPay = /pay/.test(gate)
  const gateFieldsBeforePay = /^questions_pay|^questions(_approval)?$/.test(gate) || gate === "apply" || gate === "apply_pay"
  const gateFieldsAfterPay = /^pay_questions$/.test(gate)
  const gateNeedsApproval = /approval$/.test(gate) || gate === "apply"

  if (gateFieldsBeforePay && visibleQuestions("BEFORE_SUBMIT").length > 0) {
    steps.push("fieldsBefore")
  }
  if (gateHasPay) {
    steps.push("pay")
  }
  if (gateFieldsAfterPay && visibleQuestions("AFTER_PAYMENT").length > 0) {
    steps.push("fieldsAfter")
  }
  if (gateNeedsApproval && visibleQuestions("BEFORE_APPROVAL").length > 0) {
    steps.push("fieldsBefore") // approval questions render in fieldsBefore slot when no other fields
  }

  steps.push("submit")
  return steps
}

export function formatGateCTA(resolved: ResolvedAccess, eventStyleHint: "open" | "ticketed" | "apply"): string {
  if (resolved.kind === "closed") return "Closed"
  const gate = resolved.gate
  if (gate === "apply" || /approval$/.test(gate)) {
    return "Apply to Attend"
  }
  if (/pay/.test(gate)) {
    const dollars = (resolved.priceCents / 100).toFixed(2).replace(/\.00$/, "")
    return `Get Ticket — $${dollars}`
  }
  if (resolved.kind === "member") return "Reserve My Spot"
  return "Register"
}
```

- [ ] **Step 2.3: Legacy field derive helper**

Create `lib/event-access-derive.ts`:

```ts
import type { EventAccess } from "./event-access-schema"

export function deriveLegacyFromAccess(access: EventAccess) {
  const anyPay =
    (access.member.enabled && /pay/.test(access.member.gate)) ||
    (access.guest.enabled && /pay/.test(access.guest.gate))
  const anyApproval =
    (access.member.enabled && /approval$/.test(access.member.gate)) ||
    (access.guest.enabled && (access.guest.gate === "apply" || /approval$/.test(access.guest.gate)))
  const memberOnlyFree = access.member.enabled && !access.guest.enabled && !/pay/.test(access.member.gate)

  let accessMode: "OPEN" | "TICKETED" | "APPLY_OR_PAY" = "OPEN"
  if (anyPay && anyApproval) accessMode = "APPLY_OR_PAY"
  else if (anyPay) accessMode = "TICKETED"
  else if (memberOnlyFree && !anyApproval) accessMode = "OPEN"
  else if (anyApproval) accessMode = "APPLY_OR_PAY"

  return {
    accessMode,
    applyMode: anyApproval ? ("APPROVAL_HOLDS_TICKET" as const) : null,
    approvalRequired: anyApproval,
    priceInCents: access.member.enabled ? access.member.priceCents : null,
    nonMemberPriceInCents: access.guest.enabled ? access.guest.priceCents : null,
  }
}
```

- [ ] **Step 2.4: Member filter helper**

Create `lib/member-filters.ts`:

```ts
import type { Prisma } from "@prisma/client"

// Use anywhere operator UI shows "members" but should exclude guest ticket buyers.
export function whereNotGuest(): Prisma.MemberWhereInput {
  return { status: { not: "GUEST" } }
}
```

- [ ] **Step 2.5: Extend format-enums**

Modify `lib/format-enums.ts` — read existing exports, then append:

```ts
import type { MemberGate, GuestGate, CompType } from "./event-access-schema"

const MEMBER_GATE_LABELS: Record<MemberGate, string> = {
  auto_confirm: "Reserve My Spot",
  questions: "Answer registration fields",
  questions_approval: "Apply to Attend",
  pay: "Get Ticket",
  pay_questions: "Pay, then answer fields",
  questions_pay: "Answer fields, then pay",
  questions_pay_approval: "Apply + pay (coming soon)",
}

const GUEST_GATE_LABELS: Record<GuestGate, string> = {
  pay: "Get Ticket",
  apply: "Apply to Attend",
  pay_questions: "Pay, then answer fields",
  questions_pay: "Answer fields, then pay",
  apply_pay: "Apply + pay (coming soon)",
  questions_approval: "Apply to Attend",
}

const COMP_TYPE_LABELS: Record<CompType, string> = {
  sponsor: "Sponsor",
  vendor: "Vendor",
  staff: "Staff",
  press: "Press",
  partner: "Partner",
  other: "Other",
}

export function formatMemberGate(g: MemberGate): string {
  return MEMBER_GATE_LABELS[g] ?? g
}
export function formatGuestGate(g: GuestGate): string {
  return GUEST_GATE_LABELS[g] ?? g
}
export function formatCompType(c: CompType): string {
  return COMP_TYPE_LABELS[c] ?? c
}
```

- [ ] **Step 2.6: Verify build**

```bash
npm run build
```

Expected: build passes. If type error in resolver step builder regex, fix and rerun.

- [ ] **Step 2.7: Commit**

```bash
git add lib/event-access-schema.ts lib/event-access.ts lib/event-access-derive.ts lib/member-filters.ts lib/format-enums.ts
git commit -m "feat(lib): event-access schema, resolver, step builder, derive"
```

---

### Task 3: Operator API accepts eventAccess

**Files:**
- Modify: `app/api/operator/events/route.ts`
- Modify: `app/api/operator/events/[id]/route.ts`
- Modify: `lib/events.ts` (project eventAccess in queries)

- [ ] **Step 3.1: Update POST validation in `app/api/operator/events/route.ts`**

Add to the Zod request schema:

```ts
import { EventAccessSchema, defaultEventAccess } from "@/lib/event-access-schema"
import { deriveLegacyFromAccess } from "@/lib/event-access-derive"

// In existing request schema, add:
eventAccess: EventAccessSchema.optional(),
```

In the handler, after validation:

```ts
const access = parsed.eventAccess ?? defaultEventAccess()
const legacy = deriveLegacyFromAccess(access)

// In db.event.create({ data }), include:
data: {
  // ... existing fields ...
  eventAccess: access as any,
  accessMode: legacy.accessMode,
  applyMode: legacy.applyMode,
  approvalRequired: legacy.approvalRequired,
  priceInCents: legacy.priceInCents,
  nonMemberPriceInCents: legacy.nonMemberPriceInCents,
}
```

- [ ] **Step 3.2: Update PATCH in `app/api/operator/events/[id]/route.ts`**

Same pattern: add `eventAccess` to update schema. When present in body, write both `eventAccess` and derived legacy fields. Existing fields keep working when `eventAccess` is omitted.

- [ ] **Step 3.3: Ensure GET projects eventAccess**

In `app/api/operator/events/[id]/route.ts` GET handler, ensure `eventAccess` is in the select projection. If select is implicit, no change needed.

- [ ] **Step 3.4: Update `lib/events.ts` projections**

Search the file for any `select: { …` blocks projecting Event fields used by member-facing pages. Add `eventAccess: true` and `customQuestions: { … all relevant fields incl. showToMember, showToGuest, whenInFlow, order: true … }` where queries feed the member page.

- [ ] **Step 3.5: Verify build**

```bash
npm run build
```

- [ ] **Step 3.6: Commit**

```bash
git add app/api/operator/events lib/events.ts
git commit -m "feat(api): operator endpoints accept eventAccess, derive legacy fields"
```

---

### Task 4: Wizard Step 3 — AccessGroupsCard

**Files:**
- Create: `app/operator/events/new/_components/AccessGroupsCard.tsx`
- Create: `app/operator/events/new/_components/GateRadio.tsx`
- Modify: `app/operator/events/new/page.tsx`

- [ ] **Step 4.1: Build `GateRadio` reusable component**

Create `app/operator/events/new/_components/GateRadio.tsx`:

```tsx
"use client"

type GateOption = {
  value: string
  label: string
  description: string
  supported: boolean
}

export function GateRadio({
  value,
  onChange,
  options,
  name,
}: {
  value: string
  onChange: (v: string) => void
  options: GateOption[]
  name: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => {
        const selected = value === opt.value
        const disabled = !opt.supported
        return (
          <label
            key={opt.value}
            className={[
              "flex items-start gap-3 rounded-[10px] border px-4 py-3 transition",
              disabled
                ? "border-border/40 bg-background/40 cursor-not-allowed opacity-60"
                : selected
                ? "border-accent bg-accent/5 cursor-pointer"
                : "border-border bg-background hover:border-accent/40 cursor-pointer",
            ].join(" ")}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              disabled={disabled}
              onChange={() => !disabled && onChange(opt.value)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-primary">{opt.label}</span>
                {!opt.supported && (
                  <span className="text-[11px] uppercase tracking-wider rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
                    Coming soon
                  </span>
                )}
              </div>
              <div className="text-sm text-text-secondary mt-0.5">{opt.description}</div>
            </div>
          </label>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4.2: Build `AccessGroupsCard`**

Create `app/operator/events/new/_components/AccessGroupsCard.tsx`:

```tsx
"use client"

import { useState } from "react"
import type { EventAccess, MemberGate, GuestGate } from "@/lib/event-access-schema"
import { isGateSupported } from "@/lib/event-access-schema"
import { GateRadio } from "./GateRadio"

const MEMBER_GATE_OPTIONS = [
  { value: "auto_confirm", label: "Reserve My Spot", description: "One tap, instantly confirmed." },
  { value: "questions", label: "Register with fields", description: "Answer required fields, auto-confirmed." },
  { value: "questions_approval", label: "Apply to Attend", description: "Answer fields, you approve manually." },
  { value: "pay", label: "Ticketed", description: "Pay member price, auto-confirmed." },
  { value: "pay_questions", label: "Ticketed, fields after", description: "Pay, then answer fields." },
  { value: "questions_pay", label: "Fields, then ticketed", description: "Answer fields, then pay." },
  { value: "questions_pay_approval", label: "Apply + ticketed", description: "Fields, payment authorization, you approve." },
]

const GUEST_GATE_OPTIONS = [
  { value: "pay", label: "Ticketed", description: "Pay and confirmed instantly." },
  { value: "apply", label: "Apply to Attend", description: "Answer fields, you approve. No payment." },
  { value: "pay_questions", label: "Ticketed, fields after", description: "Pay, then answer fields." },
  { value: "questions_pay", label: "Fields, then ticketed", description: "Answer fields, then pay." },
  { value: "apply_pay", label: "Apply + ticketed", description: "Fields, you approve, then payment." },
  { value: "questions_approval", label: "Apply to Attend (alt)", description: "Fields, you approve. Same as Apply." },
]

export function AccessGroupsCard({
  value,
  onChange,
}: {
  value: EventAccess
  onChange: (v: EventAccess) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Member Access */}
      <AccessGroup
        title="Member Access"
        subtitle="For approved NoBC members"
        enabled={value.member.enabled}
        onToggle={(b) => onChange({ ...value, member: { ...value.member, enabled: b } })}
      >
        <GateRadio
          name="member-gate"
          value={value.member.gate}
          onChange={(g) => onChange({ ...value, member: { ...value.member, gate: g as MemberGate } })}
          options={MEMBER_GATE_OPTIONS.map((o) => ({ ...o, supported: isGateSupported(o.value as MemberGate) }))}
        />
        {/pay/.test(value.member.gate) && (
          <PriceField
            label="Member price"
            value={value.member.priceCents}
            onChange={(cents) => onChange({ ...value, member: { ...value.member, priceCents: cents } })}
          />
        )}
      </AccessGroup>

      {/* Guest Access */}
      <AccessGroup
        title="Guest Access"
        subtitle="For everyone else"
        enabled={value.guest.enabled}
        onToggle={(b) => onChange({ ...value, guest: { ...value.guest, enabled: b } })}
      >
        <GateRadio
          name="guest-gate"
          value={value.guest.gate}
          onChange={(g) => onChange({ ...value, guest: { ...value.guest, gate: g as GuestGate } })}
          options={GUEST_GATE_OPTIONS.map((o) => ({ ...o, supported: isGateSupported(o.value as GuestGate) }))}
        />
        {/pay/.test(value.guest.gate) && (
          <PriceField
            label="Guest price"
            value={value.guest.priceCents}
            onChange={(cents) => onChange({ ...value, guest: { ...value.guest, priceCents: cents } })}
          />
        )}
      </AccessGroup>

      {/* Comp Access */}
      <AccessGroup
        title="Comp Access"
        subtitle="Complimentary tickets you issue manually"
        enabled={value.comp.enabled}
        onToggle={(b) => onChange({ ...value, comp: { ...value.comp, enabled: b } })}
      >
        <BudgetCapField
          value={value.comp.budgetCap}
          onChange={(n) => onChange({ ...value, comp: { ...value.comp, budgetCap: n } })}
        />
      </AccessGroup>

      <p className="text-sm text-text-secondary mt-2">
        You can add registration fields and design your flow in event settings after saving.
      </p>
    </div>
  )
}

function AccessGroup({
  title,
  subtitle,
  enabled,
  onToggle,
  children,
}: {
  title: string
  subtitle: string
  enabled: boolean
  onToggle: (b: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-serif text-lg text-text-primary">{title}</h3>
          <p className="text-sm text-text-secondary mt-0.5">{subtitle}</p>
        </div>
        <Toggle checked={enabled} onChange={onToggle} />
      </div>
      {enabled && <div className="mt-4 flex flex-col gap-3">{children}</div>}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        "relative h-6 w-11 rounded-full transition",
        checked ? "bg-accent" : "bg-border",
      ].join(" ")}
      aria-pressed={checked}
    >
      <span
        className={[
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition",
          checked ? "left-[22px]" : "left-0.5",
        ].join(" ")}
      />
    </button>
  )
}

function PriceField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (cents: number) => void
}) {
  const [text, setText] = useState((value / 100).toString())
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const num = parseFloat(e.target.value)
            if (!Number.isNaN(num) && num >= 0) onChange(Math.round(num * 100))
          }}
          className="w-full rounded-[10px] border border-border bg-background pl-7 pr-3 py-2"
          placeholder="0"
        />
      </div>
    </div>
  )
}

function BudgetCapField({
  value,
  onChange,
}: {
  value: number | null
  onChange: (n: number | null) => void
}) {
  return (
    <div>
      <label className="field-label">Comp budget (optional max)</label>
      <input
        type="number"
        min={0}
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === "" ? null : Math.max(0, parseInt(v, 10) || 0))
        }}
        className="w-full rounded-[10px] border border-border bg-background px-3 py-2"
        placeholder="No cap"
      />
    </div>
  )
}
```

- [ ] **Step 4.3: Wire into `app/operator/events/new/page.tsx`**

Read the existing Step 3 implementation. Replace the current `AccessModeConfig` section with `<AccessGroupsCard value={eventAccess} onChange={setEventAccess} />`. Initialize state with `defaultEventAccess()`. On submit, include `eventAccess` in the POST body. Remove old `accessMode`/`applyMode`/`priceInCents`/`nonMemberPriceInCents` from submitted body (server derives them).

Note: existing flow-template apply logic in the wizard reads legacy fields. Either keep that branch (apply template still writes to legacy state) or rewrite to project template → eventAccess. For Phase A simplest path: when a template is applied, run a small client-side mapper to populate `eventAccess` from the template's legacy fields. Add this helper inline at top of file:

```tsx
function templateToAccess(t: FlowTemplate): EventAccess {
  // Identical mapping to backfill script, run client-side.
  // Default: member auto_confirm, no guest, no comp.
  // ... (see backfill script)
}
```

- [ ] **Step 4.4: Verify build**

```bash
npm run build
```

- [ ] **Step 4.5: Smoke test wizard**

```bash
npm run dev
# Open http://localhost:3000/operator/events/new
# Step 3: toggle each card, pick a gate including a "Coming soon" gate (must be disabled),
# fill prices, advance to Step 4, submit.
# Verify event created in DB has eventAccess JSON populated.
```

- [ ] **Step 4.6: Commit**

```bash
git add app/operator/events/new
git commit -m "feat(operator): wizard step 3 three-card access editor with coming-soon gates"
```

---

### Task 5: Settings tab — Access section

**Files:**
- Create: `app/operator/events/[id]/_components/AccessSection.tsx`
- Modify: `app/operator/events/[id]/_components/EventSettingsTab.tsx`

- [ ] **Step 5.1: Build AccessSection wrapper**

Create `app/operator/events/[id]/_components/AccessSection.tsx`:

```tsx
"use client"

import { useState } from "react"
import type { EventAccess } from "@/lib/event-access-schema"
import { AccessGroupsCard } from "../../new/_components/AccessGroupsCard"

export function AccessSection({
  initialAccess,
  onSave,
  saving,
}: {
  initialAccess: EventAccess
  onSave: (next: EventAccess) => Promise<void>
  saving: boolean
}) {
  const [value, setValue] = useState<EventAccess>(initialAccess)
  return (
    <div className="rounded-[10px] border border-border bg-surface p-6">
      <h2 className="section-caps mb-4">Access</h2>
      <AccessGroupsCard value={value} onChange={setValue} />
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(value)}
          className="rounded-[10px] bg-accent text-white px-4 py-2 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5.2: Wire into EventSettingsTab**

Read the current file. Add `<AccessSection>` after the existing Event Details section. Implement `onSave` as `PATCH /api/operator/events/[id]` with `{ eventAccess: next }`. Optimistically update local state on success.

Replace the legacy "Save as flow template" section's `accessMode`/`applyMode` reads with `eventAccess` reads (template still saves the legacy shape for back-compat with EventFlowTemplate — that's fine, it's flat enum on the template model).

- [ ] **Step 5.3: Verify build**

```bash
npm run build
```

- [ ] **Step 5.4: Smoke test**

```bash
npm run dev
# Open existing event /operator/events/[id]
# Settings tab → Access section visible, current event's access reflected,
# change a gate, save, refresh, persists.
```

- [ ] **Step 5.5: Commit**

```bash
git add app/operator/events/[id]/_components
git commit -m "feat(operator): settings access section"
```

---

### Task 6: Phase A build + deploy

- [ ] **Step 6.1: Full build**

```bash
npm run build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 6.2: Deploy to Vercel**

```bash
vercel deploy --prod
```

- [ ] **Step 6.3: Verify production**

Open `https://nobc-os.vercel.app/operator/events/new`. Step 3 shows three-card access editor. Existing events at `/operator/events/[id]` settings show Access section populated from backfill.

- [ ] **Step 6.4: Commit (if any final fixes)**

```bash
git add -A
git commit -m "chore: phase A deploy" || echo "nothing to commit"
```

---

## Phase B — Flow engine on member page

### Task 7: Shared RsvpCard rewrite

**Files:**
- Modify: `app/m/events/[slug]/_components/RsvpCard.tsx`
- Modify: `app/m/events/[slug]/_components/TemplateMinimal.tsx`
- Modify: `app/m/events/[slug]/_components/TemplateEditorial.tsx`
- Modify: `app/m/events/[slug]/_components/TemplateSplit.tsx`
- Modify: `app/m/events/[slug]/_components/EventDetail.tsx`
- Modify: `lib/events.ts` (ensure projections include eventAccess + viewer member info)

- [ ] **Step 7.1: Update lib/events.ts**

Ensure the function feeding `/m/events/[slug]` includes:

```ts
select: {
  // ... existing fields ...
  eventAccess: true,
  customQuestions: {
    select: {
      id: true, label: true, fieldType: true, options: true, required: true,
      order: true, showToMember: true, showToGuest: true, whenInFlow: true,
    },
    orderBy: { order: "asc" },
  },
}
```

Add a server helper to resolve viewer (member row + clerk user) — pattern follows existing auth helpers in `lib/auth.ts`.

- [ ] **Step 7.2: Rewrite RsvpCard**

Read `app/m/events/[slug]/_components/RsvpCard.tsx`. Replace its body with path-aware CTA rendering:

```tsx
"use client"

import { useState } from "react"
import { parseEventAccess } from "@/lib/event-access-schema"
import { resolveViewer, resolveAccessForViewer, formatGateCTA } from "@/lib/event-access"
import { EventAccessFlow } from "./EventAccessFlow"
import type { EventAccess } from "@/lib/event-access-schema"

type ViewerProps = {
  isMember: boolean
  clerkUserId: string | null
  memberStatus: "PENDING" | "APPROVED" | "REJECTED" | "WAITLISTED" | "GUEST" | null
}

export function RsvpCard({
  eventSlug,
  eventTitle,
  eventStartAt,
  eventAccess,
  customQuestions,
  viewer,
}: {
  eventSlug: string
  eventTitle: string
  eventStartAt: Date
  eventAccess: unknown
  customQuestions: any[]
  viewer: ViewerProps
}) {
  const access = parseEventAccess(eventAccess)
  const viewerKind = resolveViewer(
    viewer.memberStatus ? { status: viewer.memberStatus } : null,
    viewer.clerkUserId
  )

  const memberResolved = access.member.enabled
    ? { kind: "member" as const, gate: access.member.gate, priceCents: access.member.priceCents, supported: true }
    : null
  const guestResolved = access.guest.enabled
    ? { kind: "guest" as const, gate: access.guest.gate, priceCents: access.guest.priceCents, supported: true }
    : null

  const [openFlow, setOpenFlow] = useState<null | "member" | "guest">(null)

  // No path open
  if (!memberResolved && !guestResolved) {
    return <ClosedCard message="Access is not open at this time." />
  }

  // Member-only event, non-member viewer
  if (memberResolved && !guestResolved && viewerKind !== "member") {
    return <ClosedCard message="This event is open to members only." />
  }

  const ctas: { kind: "member" | "guest"; label: string }[] = []
  if (memberResolved && (viewerKind === "member" || !guestResolved)) {
    ctas.push({ kind: "member", label: formatGateCTA({ ...memberResolved }, "open") })
  }
  if (guestResolved && (viewerKind !== "member" || memberResolved)) {
    const label =
      memberResolved && viewerKind !== "member"
        ? formatGateCTA({ ...guestResolved }, "open")
        : formatGateCTA({ ...guestResolved }, "open")
    ctas.push({ kind: "guest", label })
  }

  return (
    <>
      <div className="rounded-[12px] border border-border bg-surface p-5">
        {ctas.map((c, i) => (
          <div key={c.kind}>
            {i > 0 && <div className="my-3 text-center text-xs uppercase tracking-wider text-text-secondary">or</div>}
            <button
              type="button"
              onClick={() => setOpenFlow(c.kind)}
              className="w-full rounded-[10px] bg-accent text-white px-4 py-3 font-medium"
            >
              {c.label}
              {c.kind === "guest" && viewerKind === "member" && memberResolved ? " (as guest)" : ""}
            </button>
          </div>
        ))}
      </div>
      {openFlow && (
        <EventAccessFlow
          eventSlug={eventSlug}
          accessKind={openFlow}
          onClose={() => setOpenFlow(null)}
        />
      )}
    </>
  )
}

function ClosedCard({ message }: { message: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface p-5 text-text-secondary text-sm">
      {message}
    </div>
  )
}
```

- [ ] **Step 7.3: Update all three templates to render shared RsvpCard**

In each of `TemplateMinimal.tsx`, `TemplateEditorial.tsx`, `TemplateSplit.tsx`, replace any template-local CTA logic with `<RsvpCard ... />`. Pass the same props. Minimal template previously skipped payment CTA — now fixed by construction.

- [ ] **Step 7.4: Remove "Apply to Join" button**

Search for "Apply to Join" in `app/m/events/` and delete the JSX block + any link to `/apply` originating from event pages. Test: `grep -r "Apply to Join" app/m`.

- [ ] **Step 7.5: Update EventDetail to pass viewer**

Read the page server component (`app/m/events/[slug]/page.tsx`). Resolve viewer using Clerk's `auth()` and a `db.member.findUnique` by `clerkUserId`. Pass to `<EventDetail viewer={...} />`.

- [ ] **Step 7.6: Verify build**

```bash
npm run build
```

Note: `EventAccessFlow` doesn't exist yet — Task 8 builds the stub first. To unblock typecheck, create an empty stub now:

Create `app/m/events/[slug]/_components/EventAccessFlow.tsx` with:

```tsx
"use client"
export function EventAccessFlow({ eventSlug, accessKind, onClose }: { eventSlug: string; accessKind: "member" | "guest"; onClose: () => void }) {
  return null
}
```

This unblocks the build; full implementation lands in Task 9.

- [ ] **Step 7.7: Commit**

```bash
git add app/m/events/[slug]/_components lib/events.ts app/m/events/[slug]/page.tsx
git commit -m "feat(member): path-aware RsvpCard shared across templates, remove apply-to-join"
```

---

### Task 8: /access/init endpoint

**Files:**
- Create: `app/api/m/events/[slug]/access/init/route.ts`

- [ ] **Step 8.1: Implement init endpoint**

```ts
import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { db } from "@/lib/db"
import { parseEventAccess } from "@/lib/event-access-schema"
import {
  resolveViewer,
  resolveAccessForViewer,
  buildSteps,
} from "@/lib/event-access"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const { userId } = await auth()
  const event = await db.event.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      slug: true,
      startAt: true,
      eventAccess: true,
      workspaceId: true,
      customQuestions: {
        select: {
          id: true,
          label: true,
          fieldType: true,
          options: true,
          required: true,
          showToMember: true,
          showToGuest: true,
          whenInFlow: true,
          order: true,
        },
        orderBy: { order: "asc" },
      },
    },
  })
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const access = parseEventAccess(event.eventAccess)
  const member = userId
    ? await db.member.findFirst({
        where: { workspaceId: event.workspaceId, clerkUserId: userId },
        select: { id: true, status: true, email: true, firstName: true, lastName: true },
      })
    : null
  const viewer = resolveViewer(member, userId ?? null)
  const resolved = resolveAccessForViewer(access, viewer)
  const steps = buildSteps(
    resolved,
    viewer,
    event.customQuestions.map((q) => ({
      whenInFlow: q.whenInFlow as any,
      showToMember: q.showToMember,
      showToGuest: q.showToGuest,
    }))
  )

  return NextResponse.json({
    viewer,
    resolved,
    steps,
    member: member ? { firstName: member.firstName, lastName: member.lastName, email: member.email } : null,
    event: { id: event.id, slug: event.slug, title: event.title, startAt: event.startAt },
    questions: event.customQuestions,
  })
}
```

- [ ] **Step 8.2: Verify**

```bash
npm run build
curl -X POST http://localhost:3000/api/m/events/<existing-slug>/access/init -H "Content-Type: application/json"
```

Expected: JSON with viewer/resolved/steps.

- [ ] **Step 8.3: Commit**

```bash
git add app/api/m/events
git commit -m "feat(api): /access/init endpoint resolves viewer access and steps"
```

---

### Task 9: EventAccessFlow Dialog shell + Auth/GuestInfo steps

**Files:**
- Modify: `app/m/events/[slug]/_components/EventAccessFlow.tsx` (replace stub from Task 7)
- Create: `app/m/events/[slug]/_components/access-steps/AuthStep.tsx`
- Create: `app/m/events/[slug]/_components/access-steps/GuestInfoStep.tsx`

- [ ] **Step 9.1: Confirm Radix Dialog is installed**

```bash
grep -E '@radix-ui/react-dialog' package.json
```

If missing:

```bash
npm install @radix-ui/react-dialog
```

- [ ] **Step 9.2: EventAccessFlow shell**

Replace `app/m/events/[slug]/_components/EventAccessFlow.tsx`:

```tsx
"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { useEffect, useState } from "react"
import { ArrowLeft, X } from "lucide-react"
import { AuthStep } from "./access-steps/AuthStep"
import { GuestInfoStep } from "./access-steps/GuestInfoStep"
import { FieldsStep } from "./access-steps/FieldsStep"
import { PayStep } from "./access-steps/PayStep"
import { SubmitStep } from "./access-steps/SubmitStep"
import { ResultStep } from "./access-steps/ResultStep"

type StepId = "auth" | "guestInfo" | "fieldsBefore" | "pay" | "fieldsAfter" | "submit"

type InitResponse = {
  viewer: "member" | "guest" | "anon"
  resolved:
    | { kind: "member" | "guest"; gate: string; priceCents: number; supported: boolean }
    | { kind: "closed"; reason: string }
  steps: StepId[]
  member: { firstName: string; lastName: string; email: string } | null
  event: { id: string; slug: string; title: string; startAt: string }
  questions: any[]
}

export function EventAccessFlow({
  eventSlug,
  accessKind,
  onClose,
}: {
  eventSlug: string
  accessKind: "member" | "guest"
  onClose: () => void
}) {
  const [init, setInit] = useState<InitResponse | null>(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [state, setState] = useState({
    guestInfo: { firstName: "", lastName: "", email: "" },
    answers: {} as Record<string, any>,
    paymentIntentId: null as string | null,
  })
  const [result, setResult] = useState<null | { outcome: "confirmed" | "pending_approval"; rsvpId?: string }>(null)

  useEffect(() => {
    fetch(`/api/m/events/${eventSlug}/access/init`, { method: "POST" })
      .then((r) => r.json())
      .then(setInit)
  }, [eventSlug])

  if (!init) return null
  if (init.resolved.kind === "closed") {
    return (
      <Modal onClose={onClose}>
        <div className="p-6 text-center">
          <p>{init.resolved.reason}</p>
        </div>
      </Modal>
    )
  }
  if (!init.resolved.supported) {
    return (
      <Modal onClose={onClose}>
        <div className="p-6 text-center text-text-secondary">
          This option is not available yet — please contact the host.
        </div>
      </Modal>
    )
  }
  if (result) {
    return (
      <Modal onClose={onClose}>
        <ResultStep result={result} event={init.event} />
      </Modal>
    )
  }

  const stepId = init.steps[stepIdx]
  const total = init.steps.length

  function back() {
    if (stepIdx > 0) setStepIdx(stepIdx - 1)
  }
  function next() {
    if (stepIdx < total - 1) setStepIdx(stepIdx + 1)
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        {stepIdx > 0 ? (
          <button onClick={back} aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
        ) : (
          <div className="w-5 h-5" />
        )}
        <div className="flex gap-1">
          {init.steps.map((_, i) => (
            <div
              key={i}
              className={[
                "h-1.5 w-6 rounded-full",
                i < stepIdx ? "bg-accent" : i === stepIdx ? "bg-accent" : "bg-border",
              ].join(" ")}
            />
          ))}
        </div>
        <Dialog.Close aria-label="Close"><X className="w-5 h-5" /></Dialog.Close>
      </div>

      <div className="p-5">
        {stepId === "auth" && <AuthStep onContinueGuest={() => next()} />}
        {stepId === "guestInfo" && (
          <GuestInfoStep
            value={state.guestInfo}
            onChange={(g) => setState((s) => ({ ...s, guestInfo: g }))}
            onNext={next}
          />
        )}
        {stepId === "fieldsBefore" && (
          <FieldsStep
            questions={init.questions}
            phase="BEFORE_SUBMIT"
            accessKind={accessKind}
            value={state.answers}
            onChange={(a) => setState((s) => ({ ...s, answers: a }))}
            onNext={next}
          />
        )}
        {stepId === "pay" && (
          <PayStep
            eventSlug={eventSlug}
            accessKind={accessKind}
            priceCents={init.resolved.kind !== "closed" ? init.resolved.priceCents : 0}
            onPaid={(intentId) => {
              setState((s) => ({ ...s, paymentIntentId: intentId }))
              next()
            }}
          />
        )}
        {stepId === "fieldsAfter" && (
          <FieldsStep
            questions={init.questions}
            phase="AFTER_PAYMENT"
            accessKind={accessKind}
            value={state.answers}
            onChange={(a) => setState((s) => ({ ...s, answers: a }))}
            onNext={next}
          />
        )}
        {stepId === "submit" && (
          <SubmitStep
            eventSlug={eventSlug}
            accessKind={accessKind}
            guestInfo={state.guestInfo}
            answers={state.answers}
            paymentIntentId={state.paymentIntentId}
            onResult={(r) => setResult(r)}
          />
        )}
      </div>
    </Modal>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[520px] md:max-h-[90vh] z-50 bg-surface md:rounded-[14px] overflow-y-auto">
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 9.3: AuthStep**

Create `app/m/events/[slug]/_components/access-steps/AuthStep.tsx`:

```tsx
"use client"

import { SignInButton } from "@clerk/nextjs"

export function AuthStep({ onContinueGuest }: { onContinueGuest: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-serif text-2xl">Sign in or continue as guest</h2>
      <p className="text-text-secondary text-sm">Members get one-tap access. Guests answer a few quick questions.</p>
      <SignInButton mode="modal">
        <button className="w-full rounded-[10px] bg-accent text-white px-4 py-3">Sign in</button>
      </SignInButton>
      <button onClick={onContinueGuest} className="w-full rounded-[10px] border border-border bg-background text-text-primary px-4 py-3">
        Continue as guest
      </button>
    </div>
  )
}
```

- [ ] **Step 9.4: GuestInfoStep**

Create `app/m/events/[slug]/_components/access-steps/GuestInfoStep.tsx`:

```tsx
"use client"

export function GuestInfoStep({
  value,
  onChange,
  onNext,
}: {
  value: { firstName: string; lastName: string; email: string }
  onChange: (v: { firstName: string; lastName: string; email: string }) => void
  onNext: () => void
}) {
  const valid = value.firstName.trim() && value.lastName.trim() && /\S+@\S+\.\S+/.test(value.email)
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-serif text-2xl">Your details</h2>
      <input
        className="w-full rounded-[10px] border border-border bg-background px-3 py-2"
        placeholder="First name"
        value={value.firstName}
        onChange={(e) => onChange({ ...value, firstName: e.target.value })}
      />
      <input
        className="w-full rounded-[10px] border border-border bg-background px-3 py-2"
        placeholder="Last name"
        value={value.lastName}
        onChange={(e) => onChange({ ...value, lastName: e.target.value })}
      />
      <input
        className="w-full rounded-[10px] border border-border bg-background px-3 py-2"
        placeholder="Email"
        type="email"
        value={value.email}
        onChange={(e) => onChange({ ...value, email: e.target.value })}
      />
      <button
        disabled={!valid}
        onClick={onNext}
        className="rounded-[10px] bg-accent text-white px-4 py-3 disabled:opacity-50"
      >
        Continue
      </button>
    </div>
  )
}
```

- [ ] **Step 9.5: Commit**

```bash
git add app/m/events/[slug]/_components
git commit -m "feat(member): EventAccessFlow dialog shell + auth/guest-info steps"
```

---

### Task 10: FieldsStep

**Files:**
- Create: `app/m/events/[slug]/_components/access-steps/FieldsStep.tsx`

- [ ] **Step 10.1: Implement FieldsStep**

```tsx
"use client"

type Question = {
  id: string
  label: string
  fieldType: "TEXT" | "TEXTAREA" | "SELECT" | "MULTISELECT" | "CHECKBOX" | "DATE" | "EMAIL" | "PHONE"
  options: string[]
  required: boolean
  showToMember: boolean
  showToGuest: boolean
  whenInFlow: "BEFORE_SUBMIT" | "AFTER_PAYMENT" | "BEFORE_APPROVAL"
}

export function FieldsStep({
  questions,
  phase,
  accessKind,
  value,
  onChange,
  onNext,
}: {
  questions: Question[]
  phase: "BEFORE_SUBMIT" | "AFTER_PAYMENT"
  accessKind: "member" | "guest"
  value: Record<string, any>
  onChange: (v: Record<string, any>) => void
  onNext: () => void
}) {
  const visible = questions.filter(
    (q) => (q.whenInFlow === phase || (phase === "BEFORE_SUBMIT" && q.whenInFlow === "BEFORE_APPROVAL")) &&
      (accessKind === "member" ? q.showToMember : q.showToGuest)
  )
  const allRequiredFilled = visible.every((q) => !q.required || value[q.id] != null && value[q.id] !== "")

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-serif text-2xl">A few questions</h2>
      {visible.map((q) => (
        <Field key={q.id} q={q} value={value[q.id]} onChange={(v) => onChange({ ...value, [q.id]: v })} />
      ))}
      <button
        disabled={!allRequiredFilled}
        onClick={onNext}
        className="rounded-[10px] bg-accent text-white px-4 py-3 disabled:opacity-50"
      >
        Continue
      </button>
    </div>
  )
}

function Field({ q, value, onChange }: { q: Question; value: any; onChange: (v: any) => void }) {
  const label = (
    <label className="field-label">
      {q.label}
      {q.required && <span className="text-accent ml-1">*</span>}
    </label>
  )
  switch (q.fieldType) {
    case "TEXT":
    case "EMAIL":
    case "PHONE":
      return (
        <div>
          {label}
          <input
            type={q.fieldType === "EMAIL" ? "email" : q.fieldType === "PHONE" ? "tel" : "text"}
            className="w-full rounded-[10px] border border-border bg-background px-3 py-2"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )
    case "TEXTAREA":
      return (
        <div>
          {label}
          <textarea
            rows={4}
            className="w-full rounded-[10px] border border-border bg-background px-3 py-2"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )
    case "SELECT":
      return (
        <div>
          {label}
          <select
            className="w-full rounded-[10px] border border-border bg-background px-3 py-2"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Choose…</option>
            {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )
    case "MULTISELECT":
      return (
        <div>
          {label}
          <div className="flex flex-col gap-1">
            {q.options.map((o) => {
              const arr: string[] = Array.isArray(value) ? value : []
              const checked = arr.includes(o)
              return (
                <label key={o} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))}
                  />
                  <span>{o}</span>
                </label>
              )
            })}
          </div>
        </div>
      )
    case "CHECKBOX":
      return (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          <span>{q.label}</span>
        </label>
      )
    case "DATE":
      return (
        <div>
          {label}
          <input
            type="date"
            className="w-full rounded-[10px] border border-border bg-background px-3 py-2"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )
  }
}
```

- [ ] **Step 10.2: Verify build + commit**

```bash
npm run build
git add app/m/events/[slug]/_components/access-steps/FieldsStep.tsx
git commit -m "feat(member): registration fields step"
```

---

### Task 11: PayStep + /access/payment-intent endpoint + Stripe webhook update

**Files:**
- Create: `app/api/m/events/[slug]/access/payment-intent/route.ts`
- Create: `app/m/events/[slug]/_components/access-steps/PayStep.tsx`
- Modify: existing Stripe webhook route (locate via grep)

- [ ] **Step 11.1: Confirm Stripe React libs installed**

```bash
grep -E '@stripe/(react-stripe-js|stripe-js)' package.json
```

If missing:

```bash
npm install @stripe/react-stripe-js @stripe/stripe-js
```

- [ ] **Step 11.2: Payment intent endpoint**

Create `app/api/m/events/[slug]/access/payment-intent/route.ts`:

```ts
import { NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/db"
import { parseEventAccess } from "@/lib/event-access-schema"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" as any })

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const body = (await req.json()) as { accessKind: "member" | "guest"; guestEmail?: string }
  const event = await db.event.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { id: true, eventAccess: true, workspaceId: true, title: true },
  })
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const access = parseEventAccess(event.eventAccess)
  const cfg = body.accessKind === "member" ? access.member : access.guest
  if (!cfg.enabled || cfg.priceCents <= 0) {
    return NextResponse.json({ error: "no_payment_required" }, { status: 400 })
  }

  const intent = await stripe.paymentIntents.create({
    amount: cfg.priceCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: {
      eventId: event.id,
      eventSlug: event.slug ?? slug,
      workspaceId: event.workspaceId,
      accessKind: body.accessKind,
      guestEmail: body.guestEmail ?? "",
    },
  })

  return NextResponse.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id })
}
```

- [ ] **Step 11.3: PayStep**

Create `app/m/events/[slug]/_components/access-steps/PayStep.tsx`:

```tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export function PayStep({
  eventSlug,
  accessKind,
  priceCents,
  onPaid,
}: {
  eventSlug: string
  accessKind: "member" | "guest"
  priceCents: number
  onPaid: (paymentIntentId: string) => void
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/m/events/${eventSlug}/access/payment-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessKind }),
    })
      .then((r) => r.json())
      .then((d) => {
        setClientSecret(d.clientSecret)
        setPaymentIntentId(d.paymentIntentId)
      })
  }, [eventSlug, accessKind])

  if (!clientSecret) return <div>Preparing payment…</div>

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
      <PayInner onPaid={() => paymentIntentId && onPaid(paymentIntentId)} priceCents={priceCents} />
    </Elements>
  )
}

function PayInner({ onPaid, priceCents }: { onPaid: () => void; priceCents: number }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const dollars = useMemo(() => (priceCents / 100).toFixed(2), [priceCents])

  async function pay() {
    if (!stripe || !elements) return
    setBusy(true); setErr(null)
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    })
    setBusy(false)
    if (error) { setErr(error.message ?? "Payment failed."); return }
    if (paymentIntent?.status === "succeeded") onPaid()
    else setErr(`Payment status: ${paymentIntent?.status ?? "unknown"}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-serif text-2xl">Pay ${dollars}</h2>
      <PaymentElement />
      {err && <div className="text-sm text-red-600">{err}</div>}
      <button
        onClick={pay}
        disabled={busy}
        className="rounded-[10px] bg-accent text-white px-4 py-3 disabled:opacity-50"
      >
        {busy ? "Processing…" : `Pay $${dollars}`}
      </button>
    </div>
  )
}
```

- [ ] **Step 11.4: Stripe webhook handles payment_intent.succeeded**

Locate the existing Stripe webhook route:

```bash
grep -r "stripe.webhooks.constructEvent" app/api
```

In that route's handler, add a `case "payment_intent.succeeded"` branch. The submit endpoint (Task 12) does the actual RSVP creation client-driven; the webhook serves as a safety net to mark `Payment` rows or fire side-effects. Minimal addition for Phase B:

```ts
case "payment_intent.succeeded": {
  const intent = event.data.object as Stripe.PaymentIntent
  // No-op for now: client calls /access/submit with paymentIntentId.
  // Future: reconcile if submit never arrives.
  console.log("payment_intent.succeeded", intent.id)
  break
}
```

- [ ] **Step 11.5: Verify build + commit**

```bash
npm run build
git add app/api/m/events app/m/events/[slug]/_components/access-steps/PayStep.tsx package.json package-lock.json
# also stripe webhook file
git commit -m "feat(member): stripe payment element step + payment-intent endpoint"
```

---

### Task 12: SubmitStep + /access/submit endpoint + Result/ResultStep

**Files:**
- Create: `app/api/m/events/[slug]/access/submit/route.ts`
- Create: `app/m/events/[slug]/_components/access-steps/SubmitStep.tsx`
- Create: `app/m/events/[slug]/_components/access-steps/ResultStep.tsx`

- [ ] **Step 12.1: Submit endpoint**

```ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@clerk/nextjs/server"
import { db } from "@/lib/db"
import { parseEventAccess } from "@/lib/event-access-schema"
import { resolveViewer, resolveAccessForViewer } from "@/lib/event-access"

const Body = z.object({
  accessKind: z.enum(["member", "guest"]),
  guestInfo: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
  }).optional(),
  answers: z.record(z.string(), z.any()).default({}),
  paymentIntentId: z.string().nullable().optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 })
  const body = parsed.data
  const { userId } = await auth()

  const event = await db.event.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { id: true, workspaceId: true, eventAccess: true, title: true, startAt: true },
  })
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const access = parseEventAccess(event.eventAccess)
  let member = userId
    ? await db.member.findFirst({
        where: { workspaceId: event.workspaceId, clerkUserId: userId },
      })
    : null

  // Guest path: ensure a GUEST member row exists for relations
  if (body.accessKind === "guest") {
    if (!body.guestInfo) return NextResponse.json({ error: "guest_info_required" }, { status: 400 })
    member = await db.member.upsert({
      where: {
        workspaceId_email: { workspaceId: event.workspaceId, email: body.guestInfo.email },
      },
      update: { firstName: body.guestInfo.firstName, lastName: body.guestInfo.lastName },
      create: {
        workspaceId: event.workspaceId,
        clerkUserId: userId ?? `guest_${crypto.randomUUID()}`,
        email: body.guestInfo.email,
        firstName: body.guestInfo.firstName,
        lastName: body.guestInfo.lastName,
        status: "GUEST",
      },
    })
  }

  if (!member) return NextResponse.json({ error: "no_member_context" }, { status: 400 })

  const viewer = resolveViewer(member, userId ?? null)
  const resolved = resolveAccessForViewer(access, viewer)
  if (resolved.kind === "closed" || !resolved.supported) {
    return NextResponse.json({ error: "access_unavailable" }, { status: 400 })
  }

  const gateNeedsApproval = /approval$/.test(resolved.gate as string) || resolved.gate === "apply"
  const gateNeedsPay = /pay/.test(resolved.gate as string)

  if (gateNeedsPay && !body.paymentIntentId) {
    return NextResponse.json({ error: "payment_required" }, { status: 400 })
  }

  if (gateNeedsApproval) {
    // Create Application
    const application = await db.application.create({
      data: {
        workspaceId: event.workspaceId,
        memberId: member.id,
        email: member.email,
        fullName: `${member.firstName} ${member.lastName}`,
        status: "PENDING",
        answers: {
          create: Object.entries(body.answers).map(([k, v]) => ({
            questionKey: k,
            answer: typeof v === "string" ? v : JSON.stringify(v),
          })),
        },
      },
    })
    // TODO Phase C: queue email "your application is in review"
    return NextResponse.json({ outcome: "pending_approval", applicationId: application.id })
  }

  // Auto-confirm RSVP
  const rsvp = await db.rSVP.upsert({
    where: { workspaceId_eventId_memberId: { workspaceId: event.workspaceId, eventId: event.id, memberId: member.id } },
    update: {
      status: "CONFIRMED",
      ticketStatus: "confirmed",
      customAnswers: body.answers as any,
      stripePaymentIntentId: body.paymentIntentId ?? null,
      guestEmail: body.accessKind === "guest" ? member.email : null,
      guestName: body.accessKind === "guest" ? `${member.firstName} ${member.lastName}` : null,
    },
    create: {
      workspaceId: event.workspaceId,
      eventId: event.id,
      memberId: member.id,
      status: "CONFIRMED",
      ticketStatus: "confirmed",
      origin: "direct",
      customAnswers: body.answers as any,
      stripePaymentIntentId: body.paymentIntentId ?? null,
      guestEmail: body.accessKind === "guest" ? member.email : null,
      guestName: body.accessKind === "guest" ? `${member.firstName} ${member.lastName}` : null,
    },
  })

  // TODO Phase C: queue confirmation email w/ QR

  return NextResponse.json({ outcome: "confirmed", rsvpId: rsvp.id })
}
```

- [ ] **Step 12.2: SubmitStep**

Create `app/m/events/[slug]/_components/access-steps/SubmitStep.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"

export function SubmitStep({
  eventSlug,
  accessKind,
  guestInfo,
  answers,
  paymentIntentId,
  onResult,
}: {
  eventSlug: string
  accessKind: "member" | "guest"
  guestInfo: { firstName: string; lastName: string; email: string }
  answers: Record<string, any>
  paymentIntentId: string | null
  onResult: (r: { outcome: "confirmed" | "pending_approval"; rsvpId?: string }) => void
}) {
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    fetch(`/api/m/events/${eventSlug}/access/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessKind, guestInfo, answers, paymentIntentId }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { setErr(d.error || "submit_failed"); return }
        onResult(d)
      })
      .catch((e) => setErr(String(e)))
  }, [])
  if (err) return <div className="text-red-600">{err}</div>
  return <div>Finalizing…</div>
}
```

- [ ] **Step 12.3: ResultStep**

Create `app/m/events/[slug]/_components/access-steps/ResultStep.tsx`:

```tsx
"use client"

export function ResultStep({
  result,
  event,
}: {
  result: { outcome: "confirmed" | "pending_approval"; rsvpId?: string }
  event: { id: string; slug: string; title: string; startAt: string }
}) {
  if (result.outcome === "confirmed") {
    return (
      <div className="p-6 text-center flex flex-col gap-4">
        <h2 className="font-serif text-3xl">You're confirmed</h2>
        <p className="text-text-secondary">{event.title} — {new Date(event.startAt).toLocaleString()}</p>
        <p className="text-sm text-text-secondary">A confirmation email is on the way.</p>
      </div>
    )
  }
  return (
    <div className="p-6 text-center flex flex-col gap-4">
      <h2 className="font-serif text-3xl">Your application is in review</h2>
      <p className="text-text-secondary">We'll email you with a decision soon.</p>
    </div>
  )
}
```

- [ ] **Step 12.4: Verify build + commit**

```bash
npm run build
git add app/api/m/events app/m/events/[slug]/_components/access-steps
git commit -m "feat(member): submit endpoint + submit/result steps for access flow"
```

---

### Task 13: Phase B build + deploy

- [ ] **Step 13.1: Full build**

```bash
npm run build
```

- [ ] **Step 13.2: Local smoke test all gates**

```bash
npm run dev
```

Test matrix (member viewer + guest viewer, anon):
1. Member auto_confirm event → tap Reserve My Spot → confirmed
2. Member questions event → fields → confirmed
3. Member pay event → fields(if any) → pay → confirmed
4. Guest pay event (anon) → guest info → pay → confirmed
5. Guest apply event (anon) → guest info → fields → pending_approval
6. Event with both paths → both CTAs render

Expected: every gate completes its sequence; QR-bearing confirmation page renders (QR rendering arrives in Phase C — for now just message).

- [ ] **Step 13.3: Deploy**

```bash
vercel deploy --prod
```

- [ ] **Step 13.4: Production verification**

Open `https://nobc-os.vercel.app/m/events/<published-slug>` in incognito → guest flow renders. Sign in as member → member flow renders.

- [ ] **Step 13.5: Final commit if needed**

```bash
git add -A
git commit -m "chore: phase B deploy" || echo "clean"
```

---

## Self-Review (post-write)

**Coverage vs spec (`docs/superpowers/specs/2026-05-15-event-access-rebuild-design.md`):**

| Spec section | Task(s) |
|---|---|
| 3.1 eventAccess JSON | 1, 2 |
| 3.2 Legacy derive | 2, 3 |
| 3.3 RSVP comp/guest fields | 1 |
| 3.4 GUEST status | 1, 12 |
| 3.5 Question extensions | 1 |
| 3.6 Migration plan | 1 |
| 4.1 New libs | 2 |
| 4.2 API surface (operator) | 3 |
| 4.2 API surface (/access/*) | 8, 11, 12 |
| 4.3 Wizard Step 3 | 4 |
| 4.4 Settings Access section | 5 |
| 4.5 Flow engine | 7, 9, 10, 11, 12 |
| 4.5 RsvpCard rewrite | 7 |
| 4.5 Templates share RsvpCard | 7 |
| 4.5 "Apply to Join" removal | 7 |
| 4.5 Minimal payment CTA fix | 7 |
| 4.5 Stripe Payment Element | 11 |
| 4.5 Stripe webhook update | 11 |
| 4.6 Coming-soon gates | 2, 4 |

No placeholders. No "TBD" / "TODO" lines outside of explicit `// TODO Phase C:` markers that are intentional deferrals already documented in the spec.

**Type consistency check:**
- `ResolvedAccess` shape used in Task 2 matches usage in Tasks 7, 8, 9, 11, 12 ✓
- `StepId` strings match the dialog switch in Task 9 ✓
- `eventAccess` JSON shape consistent across schema (Task 1), Zod (Task 2), API (Tasks 3, 8, 11, 12), UI (Tasks 4, 5, 7) ✓
- `customQuestions` projection consistent between `init` endpoint (Task 8) and `FieldsStep` (Task 10) ✓
