# Clerk Configuration Audit — DEV Instance

**Reviewer:** Warden  
**Date:** 2026-06-10  
**Instance:** `ins_3DZ05q5fG3ReTYxpu8gbQFd8ue6` (development, `allowed-zebra-34.clerk.accounts.dev`)  
**Scope:** Read-only audit of dev Clerk instance via FAPI `/v1/environment` + Backend API. No writes performed.  
**Warning:** This is the DEV instance only. The prod instance (`sk_live_*`, configured in Vercel) must be audited and mirrored against these recommendations separately before any buyer-facing surface goes live.

---

## Prioritized Findings Table

| # | Setting | Current (dev) | Recommended | Severity | Decision owner | How to change |
|---|---|---|---|---|---|---|
| 1 | **Organizations required** | Unknown via API — F1 in PUBLIC-CHECKOUT-SECURITY-REVIEW flagged this as ON; current state unconfirmed via Backend API | OFF — membership optional, user-created orgs ON, auto-create-first-org OFF | HIGH | **Adam decision** (irreversible, affects all existing operators) | Clerk Dashboard → Configure → Organizations → "Membership required" → toggle OFF |
| 2 | **MFA / second factors** | `second_factors: []` — no factors configured; `sign_in.second_factor.required: false`; all users have `two_factor_enabled: false` | Enable TOTP authenticator app + backup codes for operators; make optional for members, consider required for ADMIN role | HIGH | **Adam decision** (UX change for operators) | Clerk Dashboard → Configure → Multi-factor → enable Authenticator app + Backup codes |
| 3 | **Enumeration protection** | `attack_protection.enumeration_protection.enabled: false` | ON — prevents account existence probing via sign-in/password-reset responses | HIGH | Safe to change | Clerk Dashboard → Configure → Attack protection → Enumeration protection → ON |
| 4 | **User lockout threshold** | `max_attempts: 100`, `duration_in_minutes: 60` — 100 guesses before lockout is effectively no protection | 10 attempts, 60 min lockout — standard brute-force protection | HIGH | Safe to change | Clerk Dashboard → Configure → Attack protection → User lockout → max attempts: 10 |
| 5 | **`create_organizations_limit`** | `null` (unlimited) — any user can create unlimited orgs | Set to 1 for member/buyer accounts; operators self-create exactly one workspace | MED | **Adam decision** (may constrain legitimate multi-workspace operators) | Clerk Dashboard → Configure → Organizations → "Number of organizations per user" → 1 (or discuss) |
| 6 | **Block disposable email domains** | `false` | ON — burner addresses bypass identity controls and inflate member counts | MED | Safe to change | Clerk Dashboard → Configure → Restrictions → Block disposable email domains → ON |
| 7 | **Block email subaddresses** | `false` (`block_email_subaddresses` on instance level = false; Google OAuth has it ON) | ON — `user+alias@gmail.com` bypass for account limits | MED | Safe to change | Clerk Dashboard → Configure → Restrictions → Block email subaddresses → ON |
| 8 | **Privacy policy URL** | `null` | Set to `https://thenobadcompany.com/privacy` (or app privacy page) — required before member-facing launch | MED | Safe to change | Clerk Dashboard → Customization → Display config → Privacy policy URL |
| 9 | **Terms URL** | `null` | Set to `https://thenobadcompany.com/terms` — required before member-facing launch | MED | Safe to change | Clerk Dashboard → Customization → Display config → Terms of service URL |
| 10 | **Legal consent at sign-up** | `legal_consent_enabled: false` | ON once privacy/terms URLs are set — Clerk shows a TOS checkbox | MED | **Adam decision** (UX, also interacts with the `/apply` waiver — confirm not duplicative) | Clerk Dashboard → Configure → Sign-up → Legal consent → ON |
| 11 | **After-sign-in / after-sign-up redirect** | Both point to `allowed-zebra-34.accounts.dev/default-redirect` (Clerk default) | `/operator` for operators, `/` or `/m` for members — set in ClerkProvider `afterSignInUrl` / `afterSignUpUrl` props or Clerk dashboard | MED | Safe to change | `ClerkProvider` props in `app/layout.tsx` OR Clerk Dashboard → Paths → after sign-in/up URL |
| 12 | **Enhanced email deliverability** | `false` | ON — Clerk sends auth emails from a deliverability-optimized domain; reduces spam folder risk for OTP codes | MED | Safe to change | Clerk Dashboard → Configure → Email & SMS → Enhanced deliverability → ON |
| 13 | **Auth emails — custom from domain** | Not confirmed via API — Clerk default is `@clerk.dev` or `@accounts.dev` sender | Customize from address / domain to align with `team@thenobadcompany.com` brand (Clerk supports custom SMTP or from-name override) | MED | Safe to change | Clerk Dashboard → Customization → Emails → From name / email address |
| 14 | **Support email** | `support_email: null` | Set to `team@thenobadcompany.com` — appears in Clerk-hosted auth UI error states | LOW | Safe to change | Clerk Dashboard → Customization → Display config → Support email |
| 15 | **Allowed origins (CORS)** | `allowed_origins: null` (dev — Clerk dev mode is permissive) | In prod: set to `https://nobc.app` (or actual domain) — prevents cross-origin session leakage | LOW (dev), **HIGH in prod** | Safe to change | Clerk Dashboard (prod) → Configure → Domains → Allowed origins |
| 16 | **Password policy — min length / HIBP** | Not readable via API | Minimum 8 chars + HIBP breach check should be ON | MED | Safe to change | Clerk Dashboard → Configure → Passwords → Min length + HIBP check |
| 17 | **Session lifetime / inactivity timeout** | Not readable via API | Recommend: session lifetime 7 days, inactivity 24h for operators (who hold admin PII + payment access) | MED | **Adam decision** | Clerk Dashboard → Configure → Sessions → Session lifetime + Inactivity timeout |
| 18 | **Single session mode** | `true` | Keep ON — prevents session juggling attacks, correct for this app | GOOD | No change | — |
| 19 | **Email verification at sign-up** | `verify_at_sign_up: true` | Keep ON — this is the account-link security dependency from F3 in PUBLIC-CHECKOUT-SECURITY-REVIEW | GOOD (confirmed MET) | No change | — |
| 20 | **Turnstile CAPTCHA on sign-up** | `captcha_enabled: true`, `captcha_widget_type: "smart"` | Keep ON — bot protection on sign-up is active and correct | GOOD | No change | — |
| 21 | **Google OAuth** | Enabled, `block_email_subaddresses: true` (OAuth-level) | Fine. Confirm no other unexpected providers in prod instance | GOOD | No change | — |
| 22 | **SAML connections** | 0 | None expected — correct | GOOD | No change | — |
| 23 | **OAuth applications** | 0 | None expected — correct | GOOD | No change | — |
| 24 | **JWT templates** | None configured | Acceptable for now. If claims beyond default (e.g., `workspaceId`, `role`) are needed server-side, add a template | LOW | Safe to change when needed | Clerk Dashboard → Configure → JWT Templates |
| 25 | **Redirect URL allowlist** | Empty (`[]`) | In dev: acceptable. In prod: add all legitimate redirect destinations to prevent open-redirect abuse | LOW (dev), MED in prod | Safe to change | Clerk Dashboard → Configure → Paths → Redirect URLs |
| 26 | **`branded: true`** | Clerk "Secured by Clerk" badge visible | Acceptable for now (dev/early prod). Can remove on paid Clerk plan | LOW | Safe to change (plan-dependent) | Clerk Dashboard → Customization → Branding → Remove Clerk branding |

---

## Top 5 — Do These First

**1. Verify and flip "Organizations required" OFF (HIGH — gate for buyer-facing launch)**  
The entire public-checkout architecture assumes buyers can sign up without joining an org. If this is still ON in dev (and it will be ON in prod unless explicitly changed), every buyer gets auto-provisioned a Workspace row, creating dirty operator records and unintended operator shell exposure (F1 + F2 in PUBLIC-CHECKOUT-SECURITY-REVIEW). Verify in Clerk Dashboard immediately. Must be OFF in prod before any buyer-facing surface deploys. No API can flip this — dashboard only.

**2. Enable enumeration protection (HIGH — safe to change now)**  
`enumeration_protection.enabled: false` lets an attacker probe which email addresses have accounts by observing sign-in / password-reset response timing and error messages. One toggle in Attack Protection. No UX impact to real users.

**3. Reduce lockout threshold: 100 → 10 attempts (HIGH — safe to change now)**  
100 failed attempts before lockout is effectively no brute-force protection. The current setting means an attacker can try 100 passwords against any account before triggering the 60-minute lockout. 10 attempts is the standard. Change in Dashboard → Attack protection → User lockout.

**4. Enable TOTP MFA (HIGH — Adam decision required)**  
`second_factors: []` — no MFA factors are enabled at all. Operators (ADMIN/STAFF) control member PII, event approvals, and Stripe payment captures. TOTP should be available at minimum; requiring it for ADMIN role is the right long-term posture. This requires Adam's call on the UX impact. Enabling the factor itself is safe and additive; requiring it is the policy decision.

**5. Set privacy policy + terms URLs (MED — safe to change, required before launch)**  
Both `privacy_policy_url` and `terms_url` are null. Clerk surfaces these in the hosted auth UI. Empty = legal exposure on any member-facing launch. Set these to the app's policy pages before going live.

---

## Email Verification Status (account-link security dependency)

**CONFIRMED MET.** `email_address.verify_at_sign_up: true` in `user_settings.attributes`. Every Clerk account requires email verification at sign-up. The account-link guard in F3 (which requires matching against a `verification.status === 'verified'` email address on the Clerk user object before executing `updateMany`) will always find verified addresses in production because Clerk enforces this before granting a session. The dependency is satisfied — no configuration change needed here.

---

## Could Not Read via API — Verify in Dashboard

These settings are not exposed by FAPI `/v1/environment` or the Backend API endpoints read during this audit:

- [ ] **Password minimum length** — Clerk Dashboard → Configure → Passwords. Recommend minimum 8, ideally 12.
- [ ] **Password HIBP / breach check** — Should be ON. Rejects passwords in known breach databases.
- [ ] **Password complexity requirements** (uppercase, number, symbol) — Optional but recommended for operator accounts.
- [ ] **Session token lifetime** — Recommend 7 days max for operators.
- [ ] **Inactivity timeout** — Recommend 24 hours for operators.
- [ ] **"Organizations required" exact current state** — Cannot be read via any API. Verify in Dashboard → Configure → Organizations. Must be OFF before buyer-facing surface launches.
- [ ] **Auth email from address / custom from name** — Confirm Clerk auth emails (OTP codes, magic links) display a branded from-name. Optionally configure custom SMTP to send from `team@thenobadcompany.com` domain.
- [ ] **Clerk-to-app sign-in/sign-up URLs** — Dashboard → Paths → Sign-in URL and Sign-up URL should point to the app's `/sign-in` and `/sign-up` (or `/apply`) pages, not the Clerk-hosted accounts portal.
- [ ] **Organization creation auto-join by verified domain** — If enabled, anyone with a matching email domain auto-joins an org. Verify this is OFF for all orgs.

---

## Organization Configuration — Current State vs Intended Model

The intended model (from PUBLIC-CHECKOUT-AUTH-MODEL + ADR-001): **membership optional, user-created orgs ON, auto-create-first-org OFF**. Buyers stay orgless; operators self-create exactly one workspace org.

What the API confirms:
- `actions.create_organization: true` — users can create orgs. **Correct.**
- `actions.create_organizations_limit: null` — unlimited. **Partially correct** (want to cap at 1 per user).
- `sign_up.mode: "public"` — open sign-up. **Correct** for buyers.
- 3 orgs exist in dev: "No Bad Company", "Adam's Organization", "My Test Organization". Org slugs are auto-generated with timestamp suffixes — this is normal for dev.
- `max_allowed_memberships: 5` on all orgs — fine for dev/early prod; raise when needed.

What cannot be confirmed via API:
- Whether "organizations required" is ON or OFF. **Verify in dashboard.** If still ON, F1 is not resolved.
- Whether "auto-create first organization" is ON or OFF. Should be OFF.

---

## Dev Instance Note

All findings above reflect the **development** instance (`sk_test_*`). The production instance (`sk_live_*`, stored in Vercel environment variables) is a separate Clerk instance and must be audited independently. Settings do not sync between instances. The production instance should be treated as the canonical security surface — all recommendations in this audit apply there with equal or greater urgency. The `allowed_origins: null` finding in particular is LOW severity in dev but **HIGH in prod** and must be set before any live traffic.

---

## Confirmed Positives (no action needed)

- Email verification enforced at sign-up (`verify_at_sign_up: true`) — account-link dependency met
- Turnstile CAPTCHA active on sign-up — bot abuse surface reduced
- Single session mode ON — session juggling prevented
- PII protection enabled — Clerk redacts PII in logs
- Email link requires same client — CSRF-class attack on magic links mitigated
- Google OAuth only (no unexpected providers)
- No SAML connections, no OAuth applications
- Password required (no passwordless-only path)
- `reverification: true` — sensitive action re-auth supported
