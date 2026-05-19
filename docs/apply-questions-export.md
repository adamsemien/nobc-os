# /apply Membership Application — Question Export
Generated: 2026-05-18
Source: app/apply/_components/MembershipForm.tsx

---

## What this application does

The `/apply` form is the front-of-house entry point for No Bad Company membership — a cinematic, 7-step experience that double-gates with substance before anyone reaches the operator queue. On submit, two sequential Claude calls run: first, `scoreApplication()` performs question-agnostic dimensional scoring against the active template's `QuestionDefinition` records, producing an archetype assignment, six archetype scores (0–100 each), four dimension scores (influence / contribution / activation / taste, 1–10 each), a member worth total, and 3–5 lowercase identity tags; second, `generateText()` produces 2–3 sentences of personalized copy tailored to the applicant's actual answers. The resulting profile feeds the operator applications queue for triage, the Intelligence system for community analytics, and sponsor segment targeting via archetype-to-segment mapping.

---

## What gets generated from a submitted application

- **Archetype assignment** (1 of 6) + archetype scores (0–100 per archetype) → `Application.archetype`, `Application.archetypeScores`
- **Personalized copy** (2–3 sentences tailored to specific answers) → `Application.personalizedCopy`
- **Member Worth Scores**: Influence / Contribution / Activation / Taste (1–10 each) → `Application.dimensionScores`
  - Aggregated as `memberWorthTotal` (0–100), stored as `aiScore` (0–1, i.e. `memberWorthTotal / 100`)
  - Display convention: `aiScore × 30` = score /30. Tier cutoffs: **Charter ≥ 22/30** (aiScore ≥ 0.73), **Standard 16–21/30** (aiScore ≥ 0.53), **Waitlist** below
- **AI tags** (3–5 short lowercase vibe/identity/role tags, e.g. `founder`, `operator`, `creative`, `austin-local`) → `Application.aiTags`; semantic categories the tags commonly resolve to: Founder, ContentCreator, HospitalityOperator, Investor, Press, B2BDecisionMaker
- **Operator signals**: `aiRecommendation` (strong_yes / yes / unclear / no / strong_no), `aiReasoning` (2–3 sentence operator rationale)
- **Operational data**: contact (name, email, phone), photo URLs for door check-in, dietary/accessibility notes, email + SMS consents

---

## Screen-by-screen (8 screens)

### Screen 1: Basics
**Purpose:** Cinematic opening screen. Captures contact and identity anchors before any substantive questions. Saves immediately to create the Application record and attach a draft ID to the URL (`?id=…`) for resume support. No chapter label — headline is the brand voice: *"you know who you are. prove it."*

**Questions:**
- "FULL NAME" — field: `fullName` — type: text — required: yes
- "EMAIL" — field: `email` — type: email — required: yes
- "PHONE" — field: `phone` — type: tel — required: no
- "CITY" — field: `city` — type: text — required: no
- "NEIGHBORHOOD" — field: `neighborhood` — type: text — required: no
- "WHERE ARE YOU FROM ORIGINALLY" — field: `fromOriginally` — type: text — required: no
- "BIRTHDAY" — field: `birthday` — type: date — required: no
- "WEBSITE, INSTAGRAM, OR ANYTHING THAT SHOWS YOUR WORK" — field: `links` — type: text — required: no
- "REFERRED BY" (up to 3 fields, each revealed progressively when the prior one has a value) — field: `referrers[0]`, `referrers[1]`, `referrers[2]` — type: text — required: no

**Used for:** operational, sponsor segment data, Influence axis, archetype signal

---

### Screen 2: Real Questions
**Purpose:** First substantive screen. Chapter label: REAL QUESTIONS. Heading: *Who Are You*. The three questions that establish what the applicant does, what they care about, and what they are known for — the primary substance signal for both archetype assignment and the Contribution / Activation dimensions.

**Questions:**
- "WHAT ARE YOU WORKING ON RIGHT NOW" — field: `workingOn` — type: textarea — required: no
- "WHAT ARE YOU COMPLETELY OBSESSED WITH LATELY" — field: `obsessedWith` — type: textarea — required: no
- "WHAT DO PEOPLE ALWAYS CALL YOU ABOUT" — field: `alwaysCalledAbout` — type: textarea — required: no

**Used for:** archetype signal, Contribution axis, Activation axis, binary tag triggers

---

### Screen 3: Your World
**Purpose:** Chapter label: YOUR WORLD. Heading: *Your World*. Maps the applicant's network quality, connector track record, and community loyalty — the primary signal for the Influence dimension and the Connector / Host / Patron archetype axes.

**Questions:**
- "WHO ARE THE MOST INTERESTING PEOPLE IN YOUR LIFE RIGHT NOW" — field: `interestingPeople` — type: textarea — required: no
- "TELL US ABOUT A TIME YOU CONNECTED TWO PEOPLE WHO NEEDED TO MEET" — field: `connectedPeople` — type: textarea — required: no
- "WHAT GROUP OR COMMUNITY HAVE YOU STAYED LOYAL TO, AND WHY" — field: `loyalCommunity` — type: textarea — required: no

**Used for:** Influence axis, Contribution axis, archetype signal, binary tag triggers

---

### Screen 4: Taste
**Purpose:** Chapter label: TASTE. Heading: *Taste*. Four questions that probe aesthetic judgment, discernment, and curation — the primary signal for the Curator archetype and the Taste dimension. Venue and brand mentions here are also used as raw sponsor segment signals.

**Questions:**
- "A RESTAURANT, BAR, HOTEL, OR SHOP THAT GETS THE DETAILS RIGHT" — field: `detailsRight` — type: textarea — required: no
- "WHOSE TASTE DO YOU TRUST AUTOMATICALLY" — field: `trustTaste` — type: text — required: no
- "WHAT DO YOU RECOMMEND LIKE YOU'RE GETTING PAID FOR IT" — field: `recommend` — type: textarea — required: no
- "WHERE DO YOU SPLURGE VS. WHERE DO YOU SAVE" — field: `splurgeVsSave` — type: textarea — required: no

**Used for:** archetype signal, Taste axis, sponsor segment data

---

### Screen 5: Rapid Fire
**Purpose:** Chapter label: RAPID FIRE. Heading: *Rapid Fire*. Sub-header: *"Quick answers only."* Six short-answer fields that reveal personality, lifestyle cadence, and cultural alignment faster than long-form answers can. Karaoke and coffee table answers are interpretively rich for archetype scoring.

**Questions:**
- "KARAOKE SONG" — field: `karaokeS` — type: text — required: no
- "WHAT'S ON YOUR COFFEE TABLE" — field: `coffeeTable` — type: text — required: no
- "WHAT KEEPS YOU BUSY DURING THE DAY" — field: `busyDuringDay` — type: text — required: no
- "SUNDAY MORNING" — field: `sundayMorning` — type: text — required: no
- "YOUR INSTAGRAM, TIKTOK, OR YOUTUBE" — field: `socialLink` — type: text — required: no
- "SOMETHING YOU USE EVERY DAY THAT MOST PEOPLE DON'T KNOW ABOUT" — field: `everydayItem` — type: text — required: no

**Used for:** archetype signal, Taste axis, Activation axis, binary tag triggers

---

### Screen 6: Photos
**Purpose:** Chapter label: PHOTOS. Heading: *Show Up*. Sub-header: *"Candid over headshot. We want to see you in the wild."* Photo upload is required for real submissions (skipped in demo mode). The accessibility/dietary field is purely operational — it never influences scoring.

**Questions:**
- "ADD PHOTOS (UP TO 5)" — field: `photoFiles` (uploaded; URLs stored as `photoUrls`) — type: file (image/*, multiple) — required: yes (waived in demo mode)
- "ANY DIETARY RESTRICTIONS, ACCESSIBILITY NEEDS, OR THINGS WE SHOULD KNOW" — field: `foodAccessibility` — type: textarea — required: no

**Used for:** operational

---

### Screen 7: Legal
**Purpose:** Chapter label: LEGAL. Heading: *Almost There*. Sub-header: *"This waiver is a draft for attorney review."* Scrollable waiver covering 7 legal areas. Two consent fields below the waiver; the terms checkbox is the gate on submission.

**Questions:**
- "I'd like to receive event reminders and updates via text message (optional)" — field: `consentSms` — type: checkbox — required: no
- "I have read and agree to the terms above" — field: `agreedToTerms` — type: checkbox — required: yes (submit disabled until checked)

**Used for:** legal/consent

---

### Screen 8: Reveal
**Purpose:** Chapter label: YOUR ARCHETYPE. The output screen — no questions. Cinematic 60/40 split layout. Left column shows: archetype name (large italic display type), one-liner, BY DAY story, BY NIGHT story, YOUR STORY (AI-generated personalized copy). Right column shows: archetype spectrum bars (all 6 archetypes, scores 0–100), AI identity tags, share card generator, copy link. Auto-enters night mode. Frogger easter egg trigger visible at bottom.

**Questions:** None. This screen displays AI-generated output only.

**Used for:** n/a (output only)

---

## The Six Archetypes

### Connector
**One-liner:** relationships as currency. thinks two steps ahead for everyone around them.
**Day energy:** Moves through the world already knowing who needs to meet who — not networking but pattern recognition at a social scale; the introductions made have half-lives measured in years.
**Sponsor segments:** premium travel, private members clubs, executive services, luxury automotive, wealth management

### Host
**One-liner:** sets the table before anyone asks. the room doesn't start without them.
**Day energy:** Comfort is the love language — not luxury, ease — the kind that takes real effort to create but looks completely effortless; reads rooms the way other people read faces and adjusts before anyone notices something was off.
**Sponsor segments:** spirits and F&B, hospitality tech, home and interiors, culinary, hotel brands

### Curator
**One-liner:** shares the one thing worth your time. never cries wolf.
**Day energy:** Selective with a point of view; people listen because they've earned it by being quiet when they had nothing to say — recommendations land because they're rare.
**Sponsor segments:** fashion, beauty, luxury goods, boutique hotels, design

### Builder
**One-liner:** ships things. blank page is just tuesday.
**Day energy:** Has made something from nothing and knows what that costs; never waiting for permission — always building something, the ideas don't stop when the workday does.
**Sponsor segments:** B2B SaaS, fintech, business banking, productivity tools, coworking

### Maker
**One-liner:** made something this week. can't not.
**Day energy:** The creative impulse isn't a side project — it's how they process the world; hands are always doing something the brain needed to externalize, thinking in materials, textures, sounds, forms.
**Sponsor segments:** creative tools, instruments, fashion, art supplies, independent brands

### Patron
**One-liner:** opens doors quietly. doesn't need credit.
**Day energy:** Sees potential early and acts before others can name it; support is often how things become real for people around them — not transactional, just knows what matters and backs it.
**Sponsor segments:** wealth management, real estate, luxury watches, automotive, private banking

---

## Member Worth Scoring — what feeds what

The scoring system is **question-agnostic**: dimension-to-question mapping is stored in `QuestionDefinition.scoringDimension` + `scoringWeight` records in the database, not hardcoded. The following mappings reflect the logical fit between question content and each axis; the actual weights are operator-configurable per template.

**Influence** *(social reach, credibility, network quality)*
- "WEBSITE, INSTAGRAM, OR ANYTHING THAT SHOWS YOUR WORK" (`basics.links`) — public footprint signal
- "REFERRED BY" (`basics.referrers`) — referral chain quality and depth
- "WHO ARE THE MOST INTERESTING PEOPLE IN YOUR LIFE RIGHT NOW" (`world.interestingPeople`) — caliber of network
- "WHAT DO PEOPLE ALWAYS CALL YOU ABOUT" (`real.alwaysCalledAbout`) — perceived reputation / expertise

**Contribution** *(what you create or do for others)*
- "WHAT ARE YOU WORKING ON RIGHT NOW" (`real.workingOn`) — active output and build energy
- "TELL US ABOUT A TIME YOU CONNECTED TWO PEOPLE WHO NEEDED TO MEET" (`world.connectedPeople`) — concrete contribution track record
- "WHAT GROUP OR COMMUNITY HAVE YOU STAYED LOYAL TO, AND WHY" (`world.loyalCommunity`) — sustained investment in others
- "WHAT DO YOU RECOMMEND LIKE YOU'RE GETTING PAID FOR IT" (`taste.recommend`) — advocacy and word-of-mouth generosity

**Activation** *(energy, engagement cadence, how they show up)*
- "WHAT ARE YOU COMPLETELY OBSESSED WITH LATELY" (`real.obsessedWith`) — current activation level
- "TELL US ABOUT A TIME YOU CONNECTED TWO PEOPLE WHO NEEDED TO MEET" (`world.connectedPeople`) — initiative signal
- "WHAT KEEPS YOU BUSY DURING THE DAY" (`rapid.busyDuringDay`) — lifestyle and momentum
- "SUNDAY MORNING" (`rapid.sundayMorning`) — off-hours energy and intentionality

**Taste** *(aesthetic judgment, discernment, curation)*
- "A RESTAURANT, BAR, HOTEL, OR SHOP THAT GETS THE DETAILS RIGHT" (`taste.detailsRight`) — specificity and quality bar
- "WHOSE TASTE DO YOU TRUST AUTOMATICALLY" (`taste.trustTaste`) — taste peer group
- "WHERE DO YOU SPLURGE VS. WHERE DO YOU SAVE" (`taste.splurgeVsSave`) — value hierarchy and priorities
- "WHAT'S ON YOUR COFFEE TABLE" (`rapid.coffeeTable`) — ambient cultural environment
- "YOUR INSTAGRAM, TIKTOK, OR YOUTUBE" (`rapid.socialLink`) — curatorial voice in public
- "SOMETHING YOU USE EVERY DAY THAT MOST PEOPLE DON'T KNOW ABOUT" (`rapid.everydayItem`) — friction-free discernment signal

---

## Binary Tags — trigger logic

The AI generates free-text lowercase tags (3–5 per application). These six semantic categories are the operator-meaningful clusters those tags resolve to. Trigger inference is based on the scoring prompt and question set.

**Founder**
Triggered when `workingOn` describes building a company, product, or startup with founder-level ownership; `alwaysCalledAbout` includes vetting business ideas or advising early-stage ventures; `busyDuringDay` centers on building, hiring, or fundraising.

**ContentCreator**
Triggered when `socialLink` is a YouTube, TikTok, or high-follower Instagram account with original content; `links` includes a media presence or personal publication; `recommend` describes media, podcasts, or editorial content they actively evangelize.

**HospitalityOperator**
Triggered when `workingOn` involves a restaurant, bar, hotel, venue, or hospitality-adjacent business; `detailsRight` answer demonstrates deep operational knowledge of a hospitality experience; `alwaysCalledAbout` is restaurant recommendations, sourcing, or service design.

**Investor**
Triggered when `loyalCommunity` or `connectedPeople` describes backing founders or funding early projects; `interestingPeople` includes fund managers, portfolio founders, or LPs; `alwaysCalledAbout` includes deal flow, diligence, or introductions to capital.

**Press**
Triggered when `links` includes bylines at publications or media organizations; `alwaysCalledAbout` involves editorial judgment, coverage decisions, or pitching; `socialLink` is a journalistic or critical-writing profile.

**B2BDecisionMaker**
Triggered when `workingOn` involves enterprise software, B2B services, or corporate decision-making authority; `busyDuringDay` describes vendor reviews, budget ownership, or procurement; `alwaysCalledAbout` includes evaluating tools or services for an organization.

---

## Legal Waiver — what applicants agree to

The waiver is displayed in a scrollable panel on Screen 7 (Legal). It is locked copy — never to be modified without attorney review. Seven areas covered:

1. **Membership Discretion** — NoBC reserves sole and absolute right to accept or decline any application for any reason; submission creates no obligation; decisions are final and not subject to appeal.
2. **Age Requirement** — Applicant represents and warrants they are 18 or older.
3. **Communications Consent** — Submission auto-enrolls in No Bad News (email communications: event announcements, community updates, curated content); opt-out available at any time; SMS is separately opted in below the waiver.
4. **Photo, Video, and Content Release** — Irrevocable, royalty-free, worldwide license to use likeness, image, and voice captured at NoBC events in marketing, social media, and promotional materials; survives membership termination.
5. **Data and Privacy** — Personal data used for membership administration only; not sold to third parties; retained 24 months after application or membership termination (whichever is later); deletion requests honored at `team@thenobadcompany.com`.
6. **Limitation of Liability** — NoBC and its officers, directors, employees, and agents are not liable for indirect, incidental, special, consequential, or punitive damages.
7. **Governing Law and Venue** — Texas law governs; disputes resolved exclusively in Travis County, Texas courts.
