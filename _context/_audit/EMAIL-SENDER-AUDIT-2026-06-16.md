# Transactional Email Sender Audit (2026-06-16)

Full sweep of every transactional email sender in nobc-os, run as part of the
overnight harden build. Confirms the hosted-QR bug class is gone, normalizes
copy (no em dashes), and fixes timezone + app-URL-fallback drift. Items marked
FIXED were changed on branch `chore/overnight-harden-2026-06-15`. Items marked
FLAG need Adam (a code decision, a data update, or out-of-scope).

## Sender inventory

| Sender (file:line) | Template | data:URI | Hosted QR | app-URL fallback | Em dash (pre-fix) | Auth-walled link |
|---|---|---|---|---|---|---|
| app/api/webhooks/nobc/stripe/route.ts:62 | rsvpConfirmedEmail | none | yes /api/qr | app. (ok) | yes (FIXED) | yes: /m/.../confirmed |
| lib/rsvp-submit.ts:225 | rsvpConfirmedEmail | none | yes /api/qr | app. (ok) | yes (FIXED) | yes: /m/.../confirmed |
| app/api/operator/events/[id]/comp/route.ts:94 | compTicketEmail | none | yes /api/qr | app. (ok) | yes (FIXED) | yes: /check-in/verify |
| lib/agent/tools/rsvps/comp-ticket.ts:88 | compTicketEmail | none | yes /api/qr | app. (ok) | yes (FIXED) | yes: /check-in/verify |
| lib/waitlist.ts:35 | waitlistPromotedEmail | none | n/a | app. (ok) | yes (FIXED) | /m/events (member) |
| app/api/operator/applications/[id]/reject/route.ts:66 | applicationRejectedEmail | none | n/a | n/a | yes (FIXED) | no |
| lib/agent/tools/applications/reject.ts:47 | applicationRejectedEmail | none | n/a | n/a | yes (FIXED) | no |
| lib/applications/approve.ts:100 | welcomeEmail (string) | none | n/a | app. (ok) | yes (FIXED) | no |
| app/api/apply/membership/[id]/submit/route.ts:87 | WelcomeEmail.tsx | none | n/a | **marketing (FIXED to app.)** | yes (FIXED) | /m/events (member) |
| app/api/operator/applications/[id]/waitlist/route.ts:51 | WaitlistEmail.tsx + inline subject | none | n/a | n/a | yes subject (FIXED) | no |
| lib/agent/tools/applications/waitlist.ts:42 | WaitlistEmail.tsx + inline subject | none | n/a | n/a | yes subject (FIXED) | no |
| app/api/e/[slug]/access/submit/route.ts:172 | GuestAccessConfirmation | none | yes /api/qr | app. (ok) | yes (FIXED) | no (route ORPHANED) |
| app/api/rsvp/plus-one/route.ts:133 | inline html | none | n/a | **empty '' (FIXED to app.)** | yes body (FIXED) | /m/events (guest) |
| lib/agent/tools/emails/send-custom.ts:55 | freeform (operator-authored) | none | n/a | n/a | operator copy | no |
| lib/email.ts:102 | DB templates (seed: email-templates-defaults.ts) | none | n/a | n/a | yes defaults (FIXED) | no |
| lib/alerting.ts:90 | internal ops alert | none | n/a | n/a | n/a (internal) | no |

No email sender uses a `data:` image URI. The remaining `toDataURL` callers in
the repo are non-email and out of scope: the `/m/.../confirmed` page (browser,
renders fine), MembershipForm.tsx (legally locked, client download), the QA bug
route, and intelligence deliverables.

## Fixed this run

- Em dashes removed from every email subject and body: lib/email-templates.ts,
  lib/email-templates-defaults.ts (greetings, subjects, signature constant), the
  four emails/*.tsx components, the plus-one inline body, and the two inline
  waitlist subjects.
- Date/time now renders in Central (America/Chicago): rsvpConfirmedEmail and
  compTicketEmail (were America/New_York), GuestAccessConfirmation and the
  plus-one date (had no timezone, rendered raw UTC on Vercel).
- app-URL fallback normalized to `https://app.thenobadcompany.com`:
  WelcomeEmail.tsx (was the marketing host, which also broke its /m/events CTA)
  and the plus-one email (was an empty string, producing a relative, broken
  link in mail clients).

## FLAG: needs Adam

1. **Auth-walled fallback links (WS1c, plan-only, awaiting approval).** Four
   senders give a fallback link behind a Clerk-gated path: rsvpConfirmedEmail and
   the plus-one/waitlist member links point at `/m/...`; compTicketEmail points at
   `/check-in/verify/...`. An unauthenticated ticket holder hits the sign-in wall.
   Proposed fix: a public confirmation route keyed by rsvpId, mirroring /api/qr
   indirection. Not built. See the WS1c plan.
2. **Greeting name can render wrong (the "Adam Jordan" report, WS1b).** Not a
   template bug. resolveTicketRecipient (lib/ticket-confirmation.ts:18-20) uses
   `rsvp.guestName` when set, else `member.firstName + member.lastName`. So the
   wrong name is data: either the RSVP row's `guestName` (typed at checkout) or
   the Member row's first/last. To confirm which, look up the RSVP for that
   purchase and read `guestName` plus the linked Member's `firstName`/`lastName`
   (a read query, not run here per the no-DB constraint).
3. **Already-seeded DB email templates still hold em dashes.** This run fixed the
   source defaults (email-templates-defaults.ts). Workspaces seeded earlier have
   the old copy stored as data in the DB. A re-seed or data update is needed to
   clean those rows. Not touched (data, not code).
4. **Dead code.** emails/DeclineEmail.tsx has no importer; applicationApprovedEmail
   in email-templates.ts has no caller (approve.ts uses welcomeEmail). Em dashes in
   both were fixed anyway. Candidates for removal (ask before deleting).
5. **Non-email em dashes (out of this workstream's scope).** Found but not changed:
   app/check-in/[slug]/_components/CheckInClient.tsx:447,
   app/operator/applications/_components/ApplicationsQueue.tsx:1059,
   app/operator/members/import/ImportPreviewClient.tsx, and the lib/pdf/*
   recap/brief documents. These are UI and PDF copy, not email.
