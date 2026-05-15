# /apply Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first, branded membership application form at `/apply/[slug]` with PostgreSQL persistence and Claude AI tagging on submit.

**Architecture:** Public Next.js App Router page at `app/apply/[slug]/page.tsx` (client component). Form POSTs to `app/api/apply/[slug]/route.ts`, which validates input with Zod, checks for red-listed members and duplicate applications, creates an `Application` + `ApplicationAnswer` in a Prisma transaction, calls Claude Sonnet 4.6 synchronously via the Vercel AI SDK to generate `aiTags`, updates the record, then returns `{ status: "success" }`. No Member record is created at apply-time; that happens post-approval via Clerk.

**Tech Stack:** Next.js 15 App Router, Prisma 7/Neon, Tailwind v4, Radix UI (Checkbox, Label), Vercel AI SDK (`ai` + `@ai-sdk/anthropic`), Zod 4, Playfair Display via `next/font/google`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `prisma/schema.prisma` | Add `HOLD` enum, `Member.redListed`, `Application.city/consentEmail/consentSms` |
| Modify | `app/globals.css` | Add Playfair font CSS var, warm bg token |
| Create | `app/apply/[slug]/page.tsx` | Client form component — all UI, states, submit handler |
| Create | `app/api/apply/[slug]/route.ts` | POST handler — validation, checks, DB writes, AI tagging |

---

## Task 1: Schema Changes

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `HOLD` to `ApplicationStatus` enum**

Open `prisma/schema.prisma`. Find:
```prisma
enum ApplicationStatus {
  PENDING
  APPROVED
  REJECTED
}
```
Replace with:
```prisma
enum ApplicationStatus {
  PENDING
  APPROVED
  REJECTED
  HOLD
}
```

- [ ] **Step 2: Add `redListed` to `Member`**

Find the `model Member` block. Add after the `aiSummary` line:
```prisma
  redListed         Boolean      @default(false)
```

- [ ] **Step 3: Add `city`, `consentEmail`, `consentSms` to `Application`**

Find the `model Application` block. Add after the `referredBy` line:
```prisma
  city          String?
  consentEmail  Boolean           @default(false)
  consentSms    Boolean           @default(false)
```

- [ ] **Step 4: Regenerate Prisma client**

```bash
cd /Users/adamsemien/nobc-os
npx prisma generate
```

Expected: `✔ Generated Prisma Client` with no errors.

- [ ] **Step 5: Push schema to Neon**

```bash
npx prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add HOLD status, redListed, city, consent fields"
```

---

## Task 2: Install Dependencies

**Files:** none (package.json + lock file)

- [ ] **Step 1: Install**

```bash
cd /Users/adamsemien/nobc-os
npm install ai @ai-sdk/anthropic @radix-ui/react-checkbox
```

Expected: 3 packages added, no peer dep errors.

- [ ] **Step 2: Verify**

```bash
node -e "require('@ai-sdk/anthropic'); require('ai'); require('@radix-ui/react-checkbox'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install ai sdk, anthropic provider, radix checkbox"
```

---

## Task 3: Update `globals.css`

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add Playfair font var and warm apply background to the CSS**

Open `app/globals.css`. Add the following to the `:root` block and `@theme inline` block:

Find `:root {` block and add two new custom properties:
```css
:root {
  --background: #ffffff;
  --foreground: #171717;
  --apply-bg: #faf9f7;       /* warm off-white for apply page */
  --apply-border: #e8e3db;   /* warm input border */
}
```

Find `@theme inline {` block and add:
```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-apply-bg: var(--apply-bg);
  --color-apply-border: var(--apply-border);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-playfair: var(--font-playfair-display);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat(styles): add Playfair font var and warm apply page tokens"
```

---

## Task 4: Build the Form Page

**Files:**
- Create: `app/apply/[slug]/page.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p /Users/adamsemien/nobc-os/app/apply/\[slug\]
```

- [ ] **Step 2: Write `app/apply/[slug]/page.tsx`**

```tsx
'use client';

import { use, useState } from 'react';
import { Playfair_Display } from 'next/font/google';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as Label from '@radix-ui/react-label';
import { Check } from 'lucide-react';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair-display',
});

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  referredBy: string;
  whyJoin: string;
  consentEmail: boolean;
  consentSms: boolean;
};

type Status = 'idle' | 'loading' | 'success' | 'already_applied' | 'error';

function Field({
  label,
  id,
  type = 'text',
  value,
  onChange,
  required,
}: {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label.Root
        htmlFor={id}
        className="text-sm font-normal text-neutral-500"
      >
        {label}
      </Label.Root>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-md border border-apply-border bg-apply-bg px-3 py-2.5 text-sm text-foreground placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 transition-shadow"
      />
    </div>
  );
}

function ConsentCheck({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(!!v)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border border-apply-border bg-apply-bg focus:outline-none focus:ring-1 focus:ring-neutral-400 data-[state=checked]:bg-foreground data-[state=checked]:border-foreground transition-colors"
      >
        <Checkbox.Indicator className="flex items-center justify-center">
          <Check className="h-2.5 w-2.5 text-background" strokeWidth={3} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <Label.Root htmlFor={id} className="text-sm font-normal text-neutral-500 leading-snug cursor-pointer">
        {label}
      </Label.Root>
    </div>
  );
}

function SuccessView() {
  return (
    <main className="min-h-screen bg-apply-bg flex flex-col items-center justify-center px-5 text-center">
      <p className="text-xs tracking-widest uppercase text-neutral-400 mb-8">No Bad Company</p>
      <h1 className={`${playfair.variable} font-playfair text-3xl text-foreground mb-4`}>
        You're on the list.
      </h1>
      <p className="text-sm text-neutral-500 max-w-xs">
        We review applications personally. If it's a fit, you'll hear from us.
      </p>
    </main>
  );
}

function AlreadyAppliedView() {
  return (
    <main className="min-h-screen bg-apply-bg flex flex-col items-center justify-center px-5 text-center">
      <p className="text-xs tracking-widest uppercase text-neutral-400 mb-8">No Bad Company</p>
      <h1 className={`${playfair.variable} font-playfair text-3xl text-foreground mb-4`}>
        You're already on the list.
      </h1>
      <p className="text-sm text-neutral-500 max-w-xs">
        We have your application. We'll be in touch.
      </p>
    </main>
  );
}

export default function ApplyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const [form, setForm] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    city: '',
    referredBy: '',
    whyJoin: '',
    consentEmail: false,
    consentSms: false,
  });
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch(`/api/apply/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.status === 'already_applied') {
        setStatus('already_applied');
      } else if (data.status === 'success') {
        setStatus('success');
      } else {
        setErrorMsg(data.message ?? 'Something went wrong. Please try again.');
        setStatus('error');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  }

  if (status === 'success') return <SuccessView />;
  if (status === 'already_applied') return <AlreadyAppliedView />;

  return (
    <main className={`${playfair.variable} min-h-screen bg-apply-bg flex flex-col items-center px-5 py-16`}>
      <p className="text-xs tracking-widest uppercase text-neutral-400 mb-12">
        No Bad Company
      </p>

      <div className="w-full max-w-sm">
        <h1 className="font-playfair text-4xl text-foreground text-center mb-2 leading-tight">
          Apply for Membership
        </h1>
        <p className="text-sm text-neutral-500 text-center mb-10">
          Membership is by application.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="First name"
              id="firstName"
              value={form.firstName}
              onChange={(v) => setForm((f) => ({ ...f, firstName: v }))}
              required
            />
            <Field
              label="Last name"
              id="lastName"
              value={form.lastName}
              onChange={(v) => setForm((f) => ({ ...f, lastName: v }))}
              required
            />
          </div>

          <Field
            label="Email"
            id="email"
            type="email"
            value={form.email}
            onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            required
          />

          <Field
            label="Phone"
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
          />

          <Field
            label="City"
            id="city"
            value={form.city}
            onChange={(v) => setForm((f) => ({ ...f, city: v }))}
          />

          <Field
            label="How did you hear about us?"
            id="referredBy"
            value={form.referredBy}
            onChange={(v) => setForm((f) => ({ ...f, referredBy: v }))}
          />

          <div className="flex flex-col gap-1.5">
            <Label.Root
              htmlFor="whyJoin"
              className="text-sm font-normal text-neutral-500"
            >
              Why do you want to join?
            </Label.Root>
            <textarea
              id="whyJoin"
              rows={4}
              required
              value={form.whyJoin}
              onChange={(e) =>
                setForm((f) => ({ ...f, whyJoin: e.target.value }))
              }
              className="w-full rounded-md border border-apply-border bg-apply-bg px-3 py-2.5 text-sm text-foreground placeholder:text-neutral-400 resize-none focus:outline-none focus:ring-1 focus:ring-neutral-400 transition-shadow"
            />
          </div>

          <div className="space-y-3 pt-1">
            <ConsentCheck
              id="consentEmail"
              checked={form.consentEmail}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, consentEmail: v }))
              }
              label="I agree to receive email updates from No Bad Company."
            />
            <ConsentCheck
              id="consentSms"
              checked={form.consentSms}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, consentSms: v }))
              }
              label="I agree to receive SMS updates from No Bad Company."
            />
          </div>

          {status === 'error' && (
            <p className="text-sm text-red-500 text-center">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded bg-foreground text-background py-3 text-sm font-medium disabled:opacity-50 hover:opacity-80 transition-opacity mt-2"
          >
            {status === 'loading' ? 'Submitting…' : 'Apply'}
          </button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Start dev server and verify the page renders**

```bash
cd /Users/adamsemien/nobc-os && npm run dev
```

Visit `http://localhost:3000/apply/test-slug` in a browser. Expected: page renders with Playfair headline, warm off-white background, form fields visible, no console errors.

- [ ] **Step 4: Commit**

```bash
git add app/apply/
git commit -m "feat(apply): add branded mobile-first membership application form"
```

---

## Task 5: Build the API Route

**Files:**
- Create: `app/api/apply/[slug]/route.ts`

- [ ] **Step 1: Add `ANTHROPIC_API_KEY` to `.env.local`**

Open `.env.local` and add:
```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

The `@ai-sdk/anthropic` package reads this variable automatically.

- [ ] **Step 2: Create the directory**

```bash
mkdir -p "/Users/adamsemien/nobc-os/app/api/apply/[slug]"
```

- [ ] **Step 3: Write `app/api/apply/[slug]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { db } from '@/lib/db';

const ApplySchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  city: z.string().optional(),
  referredBy: z.string().optional(),
  whyJoin: z.string().min(1),
  consentEmail: z.boolean(),
  consentSms: z.boolean(),
});

const TagSchema = z.object({
  tags: z.array(z.string()),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Parse & validate
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Invalid request.' },
      { status: 400 },
    );
  }

  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', message: 'Please fill in all required fields.' },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Workspace lookup
  const workspace = await db.workspace.findUnique({ where: { slug } });
  if (!workspace) {
    return NextResponse.json(
      { status: 'error', message: 'Not found.' },
      { status: 404 },
    );
  }

  // Duplicate check — block PENDING, APPROVED, HOLD
  const existing = await db.application.findFirst({
    where: {
      workspaceId: workspace.id,
      email: data.email,
      status: { in: ['PENDING', 'APPROVED', 'HOLD'] },
    },
  });
  if (existing) {
    return NextResponse.json({ status: 'already_applied' });
  }

  // Red list check — silently reject
  const redListed = await db.member.findFirst({
    where: {
      workspaceId: workspace.id,
      email: data.email,
      redListed: true,
    },
  });
  if (redListed) {
    await db.application.create({
      data: {
        workspaceId: workspace.id,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        city: data.city,
        referredBy: data.referredBy,
        consentEmail: data.consentEmail,
        consentSms: data.consentSms,
        status: 'REJECTED',
        aiTags: [],
      },
    });
    return NextResponse.json({ status: 'success' });
  }

  // Create Application + ApplicationAnswer in a transaction
  const application = await db.$transaction(async (tx) => {
    const app = await tx.application.create({
      data: {
        workspaceId: workspace.id,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        city: data.city,
        referredBy: data.referredBy,
        consentEmail: data.consentEmail,
        consentSms: data.consentSms,
        status: 'PENDING',
        aiTags: [],
      },
    });
    await tx.applicationAnswer.create({
      data: {
        applicationId: app.id,
        questionKey: 'why_join',
        answer: data.whyJoin,
      },
    });
    return app;
  });

  // AI tagging — non-fatal if it fails
  try {
    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: TagSchema,
      prompt: `Extract 3–8 short descriptive tags from this No Bad Company membership application. Cover: industry/profession, personality/vibe signals, referral source, seniority signals, and location context. Tags should be lowercase, 1-3 words each, useful for filtering applicants.

Applicant: ${data.firstName} ${data.lastName}
City: ${data.city ?? 'not provided'}
How they heard about us: ${data.referredBy ?? 'not provided'}
Why they want to join:
${data.whyJoin}`,
    });

    await db.application.update({
      where: { id: application.id },
      data: { aiTags: object.tags },
    });
  } catch (err) {
    console.error('[apply] AI tagging failed:', err);
  }

  return NextResponse.json({ status: 'success' });
}
```

- [ ] **Step 4: Smoke-test the API with curl**

With the dev server running (`npm run dev`), first create a workspace in your DB with slug `test` (or use an existing one). Then:

```bash
curl -X POST http://localhost:3000/api/apply/test \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com",
    "phone": "555-0100",
    "city": "New York",
    "referredBy": "A friend",
    "whyJoin": "I have been following NoBC for years and believe deeply in the community values.",
    "consentEmail": true,
    "consentSms": false
  }'
```

Expected response: `{"status":"success"}`

Check Prisma Studio (`npx prisma studio`) to verify:
- `Application` record created with `status: PENDING`
- `ApplicationAnswer` record with `questionKey: why_join`
- `aiTags` array populated with 3–8 string tags

- [ ] **Step 5: Test duplicate detection**

Run the same curl again. Expected: `{"status":"already_applied"}`

- [ ] **Step 6: Test form-to-API end-to-end in browser**

Visit `http://localhost:3000/apply/test`, fill in all fields, submit. Expected: form transitions to success view. Check DB for the new Application + ApplicationAnswer records.

- [ ] **Step 7: Commit**

```bash
git add app/api/apply/ .env.local
git commit -m "feat(api): add apply submission route with dupe check, red list, AI tagging"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| Route `app/apply/page.tsx` (public) | Task 4 — note: route is `app/apply/[slug]/page.tsx` per design decision |
| API route `app/api/apply/route.ts` | Task 5 — note: `app/api/apply/[slug]/route.ts` per design decision |
| Create Application record on submit | Task 5, Step 3 — `db.$transaction` block |
| Create ApplicationAnswer for why_join | Task 5, Step 3 — `tx.applicationAnswer.create` |
| No Member record at apply-time | Confirmed — no Member creation anywhere in plan |
| AI tagging via Claude Sonnet 4.6 | Task 5, Step 3 — `generateObject` + `anthropic('claude-sonnet-4-6')` |
| Store aiTags on Application | Task 5, Step 3 — `db.application.update` after tagging |
| Red list check — silent reject | Task 5, Step 3 — `redListed` query → create REJECTED application → return success |
| Duplicate check PENDING/APPROVED/HOLD | Task 5, Step 3 — `status: { in: ['PENDING', 'APPROVED', 'HOLD'] }` |
| Form fields: firstName, lastName, email, phone, city, referredBy, whyJoin, consent | Task 4 — all fields present |
| Radix UI primitives | Task 4 — `@radix-ui/react-checkbox`, `@radix-ui/react-label` |
| Serif headline, warm editorial feel | Task 4 — Playfair Display, warm bg tokens |
| Mobile-first, max-width centered | Task 4 — `max-w-sm`, responsive grid for name row |
| No Twilio, no SMS sending | Confirmed — no SMS sending anywhere |
| `approved: false` on Member | N/A — Member not created at apply-time (by design) |
| Install `ai` + `@ai-sdk/anthropic` | Task 2 |
| `redListed` field on Member | Task 1, Step 2 |
| Schema fields city/consentEmail/consentSms | Task 1, Step 3 |
| `HOLD` status | Task 1, Step 1 |

**Placeholder scan:** None found. All steps have concrete code or commands.

**Type consistency:** `ApplySchema` fields in Task 5 match form state `FormData` type in Task 4. `application.id` referenced after creation in same scope. `TagSchema` used in both `generateObject` and consistent with `object.tags` access.
