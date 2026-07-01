# Baseline SaaS Requirements — NoBC OS

**Purpose:** This is the standing "par for the course" reference for NoBC OS. It exists so nothing structural gets forgotten and no flow ships without an explicit risk judgment. It is not optional reading — it is referenced from CLAUDE.md and applies to every CC session that touches a new page, flow, or feature.

**How this doc is used:**
- Section 1 (Structural Baseline) — checked once per *page/surface type*. If you're building a new page that's a "form," check the Forms row. If it's a new authed area, check the Account/Session rows.
- Section 2 (Flow-Risk Questions) — run for every *new or modified flow*, not just once. This is judgment, not a checkbox — answer the questions, don't just skim them.
- Section 3 (Security/Compliance Baseline) — applies platform-wide, checked at build time and again before any deploy.
- Section 4 (NoBC OS-Specific Overrides) — where this repo diverges from generic advice. This section wins every conflict with Sections 1-3.

If a CC prompt touches a new user-facing surface, the prompt should reference the relevant subsection here explicitly, not assume CC will remember.

---

## 1. Structural Baseline

Generic checklist — catches *category-level absence* (a whole thing missing), not judgment calls. Source: Front-End-Checklist, API-Security-Checklist, and default coverage of major SaaS boilerplates (ixartz/SaaS-Boilerplate, open-saas).

### 1.1 Auth & Account
- [ ] Sign in / sign up
- [ ] Sign out — visible, reachable from every authed screen, not buried
- [ ] Password reset / forgot password (or equivalent for passwordless)
- [ ] Email verification (if email is a trust signal for the app)
- [ ] Session expiry — user is warned before forced logout, not just silently dropped
- [ ] Re-authentication after expiry preserves in-progress work where feasible (see Section 2 — autosave)
- [ ] Account deletion / data export path exists somewhere, even if manual-request-only at MVP stage

### 1.2 Legal / Compliance Surface
- [ ] Terms of Service — linked, reachable from footer and from any signup/consent point
- [ ] Privacy Policy — linked, reachable, canonical URL (no redirect chains)
- [ ] Refund policy (if money changes hands)
- [ ] Consent capture — explicit, timestamped, stored (not just "implied by using the app")
- [ ] Cookie/tracking disclosure if applicable

### 1.3 Every Page Needs
- [ ] Loading state
- [ ] Empty state (not just loading state that never resolves)
- [ ] Error state — distinguishable from empty state, with a recovery action if possible
- [ ] 404 page
- [ ] 500 / unexpected-error page that doesn't leak stack traces to the user

### 1.4 Forms (any form, not just long ones)
- [ ] Inline validation with specific error messages, not just "invalid input"
- [ ] Submit button disabled state during submission (no double-submit)
- [ ] Success confirmation — visible, not just a silent redirect
- [ ] Field-level error focus (user's eye goes to the problem, not a generic banner)

### 1.5 Notifications / Email
- [ ] Transactional email has a plain-text fallback
- [ ] Every outbound email has an unsubscribe or preference-management path (even transactional-adjacent ones, if it's not strictly required-for-service)
- [ ] In-app notification state (read/unread) if the app has any notification surface at all

### 1.6 Admin / Internal Tooling
- [ ] Any internal/admin surface is gated separately from customer auth, not just "hidden" behind a route
- [ ] Admin actions on user data are logged somewhere (who did what, when)

---

## 2. Flow-Risk Questions (run per-flow, not once)

This is the layer generic checklists miss. Checklists catch "no autosave feature exists anywhere." They don't catch "this specific multi-step application flow will lose 40% of users' progress if their session drops." That's a judgment call about *this* flow, and it has to be made explicitly, every time, not assumed away by a static list.

**Before shipping any new or modified data-entry or multi-step flow, answer these out loud (in the CC report, not just in your head):**

1. **How long does this flow take a real user to complete?** Under 30 seconds → autosave is probably overkill. Multiple minutes or multiple steps → autosave or draft-save is probably required, not optional.
2. **What happens if the user's session drops mid-flow?** Data gone silently is a failure. Data gone with a warning is tolerable. Data preserved is best. Pick one on purpose — don't let it be an accident of implementation.
3. **What happens if the user navigates away and comes back?** Do they resume where they left off, or start over? If "start over," is that acceptable for this specific flow's stakes (a search filter — fine; a membership application — not fine)?
4. **Is this flow high-abandonment-cost?** (Money, identity info, anything that took real effort to produce — e.g. a long-form application, an event build, a sponsor deliverable draft). If yes, draft-save is not optional.
5. **Does this flow have irreversible actions?** (Delete, submit-final, charge a card). If yes: confirmation step required, and it must state what's irreversible in plain language, not just "Are you sure?"
6. **Is there a rate limit or throttle risk?** (Repeated submits, search, anything hitting an external API like Stripe or Resend). If yes, debounce/backoff needs to be explicit, not assumed.
7. **What's the mobile/interrupted-session case?** Phone locks, app backgrounds, network drops — does the flow assume an uninterrupted desktop session? If the real user is on a phone at an event, this question matters more, not less.

**Rule:** If the answer to Q1 or Q4 is "yes, this is long/high-stakes," draft-save/autosave is a requirement, not a nice-to-have, and should be spec'd before build starts — not bolted on after someone loses their application halfway through (see: `feat/apply-status-and-toast`).

---

## 3. Security & Compliance Baseline

Source: API-Security-Checklist, OWASP-adjacent defaults. Platform-wide, not per-flow.

- [ ] No Basic Auth anywhere — standard token/session auth only
- [ ] Rate limiting / throttling on auth endpoints (login, password reset, signup) to prevent brute force
- [ ] HTTPS enforced, HSTS header set
- [ ] CSRF protection on state-changing requests; SameSite cookie attributes set
- [ ] CSP header present (mitigates XSS/injection)
- [ ] No sequential/guessable resource IDs exposed in URLs (use UUIDs, not auto-increment ints, for anything user-facing)
- [ ] Authorization checked server-side on every request that touches another user's data — never trust client-side role checks alone
- [ ] Secrets never hardcoded, never committed — environment variables or a secret manager only
- [ ] File uploads: filename sanitized, EXIF stripped from images if not needed, uploaded to object storage (R2/S3) rather than executed on your own server
- [ ] Webhook endpoints (Stripe, etc.) verify signatures — never trust an unverified webhook payload
- [ ] PII/sensitive fields (email, phone, tokens) encrypted at rest where the platform supports it

---

## 4. NoBC OS-Specific Overrides

Where this repo's actual decisions win over the generic advice above. This section exists so nobody re-litigates already-settled calls by pointing at a generic checklist.

- **ToS / Privacy / Refund policy / About** — already live on `thenobadcompany.com`. Section 1.2 is satisfied platform-wide. Do not re-flag as missing.
- **"Access" not "RSVP"** — Section 1.4 success-confirmation copy must use "Access," never "RSVP," per brand law.
- **Apply flow already has draft-save** — `feat/apply-status-and-toast` (save-draft toast + `ApplicantStatus.tsx`) is the Section 2 answer for the membership application flow specifically. Confirmed high-abandonment-cost, multi-step, session-drop-risk flow — this is the reference example for when Section 2's Q1/Q4 say "yes."
- **Frozen zones still apply on top of this doc.** This checklist does not override frozen-zone rules (`MembershipForm` internals, gate engine internals, `EventAccessFlow` internals, `config/archetypes.ts`, `lib/scoring.ts`). If a Section 1 or 2 item would require touching a frozen zone, flag it for Adam's explicit unfreeze — do not proceed.
- **Multi-tenant note:** because NoBC is Tenant Zero on a platform meant to license out, treat every Section 1/3 item as "does this hold for a tenant that isn't NoBC too," not just "does this work for our own events."
- **Admin/internal tooling (Section 1.6):** DevToolbar (`⌘⇧⌥D`, `DEV_USER_IDS`-gated) satisfies the separate-gating requirement. Producer is a separate database/app — its own admin auth is out of scope for this doc.

---

## 5. When CC Should Reference This Doc

A CC prompt building or modifying any of the following should cite the specific subsection in the prompt itself, not just assume coverage:

| Work type | Reference |
|---|---|
| New page | 1.3 |
| New form or multi-step flow | 1.4 + all of Section 2 |
| Anything touching auth/session | 1.1 |
| New consent point or data collection | 1.2 |
| New email/notification | 1.5 |
| New admin surface | 1.6 |
| Anything touching Stripe, webhooks, or file upload | Section 3 |

Structured report at the end of any such CC session should include a line: **"Section X reviewed: [what was checked, what applies, what doesn't and why]."** Not a rubber-stamp — a real answer, especially for Section 2's judgment questions.
