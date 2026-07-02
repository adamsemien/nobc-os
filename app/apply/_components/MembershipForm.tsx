'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ARCHETYPES, ARCHETYPE_ORDER, ArchetypeName } from '@/config/archetypes';
import { CONSENT_DISCLOSURES, TERMS_VERSION } from '@/lib/apply-consent';
import dynamic from 'next/dynamic';
import { Mic } from 'lucide-react';
import QRCode from 'qrcode';
import {
  QUESTIONS,
  SECTIONS,
  INTRO,
  type Question,
  type SubField,
} from '../_lib/questions';

const FroggerGame = dynamic(() => import('./FroggerGame'), { ssr: false });

const displayFont = "'PP Editorial New', Georgia, serif";
const bodyFont = "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Arial, sans-serif";

const THEME = {
  day: {
    bg: 'var(--bg)',
    text: 'var(--text-primary)',
    accent: 'var(--primary)',
    muted: 'var(--text-secondary)',
    border: 'var(--border)',
    tertiary: 'var(--text-tertiary)',
  },
  night: {
    bg: 'var(--bg-night)',
    text: 'var(--text-night)',
    accent: 'var(--accent-night)',
    muted: 'var(--muted-night)',
    border: 'var(--border-night)',
    tertiary: 'var(--tertiary-night)',
  },
  primary: 'var(--primary)',
};

interface FormData {
  fullName: string;
  email: string;
  phone: string;
  foodAccessibility: string;
  photoUrls: string[];
  agreedToTerms: boolean;
  consentEmail: boolean;
  consentSms: boolean;
}

interface SubmitResult {
  archetype: string;
  archetypeScores: Record<string, number>;
  tags: string[];
  personalizedCopy: string;
  rsvpId?: string | null;
  memberQrCode?: string | null;
}

// Door 1 reveal QR — mirrors the Door 2 confirmation QR treatment (qrcode -> SVG,
// light code on a white field so it scans against the dark reveal background). The
// code is the applicant's permanent member QR (always minted; QR law). The label
// intentionally does NOT imply event approval — the comp may still be pending review.
function QrReveal({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(code, {
      type: 'svg',
      width: 180,
      margin: 2,
      color: { dark: '#1C1008', light: '#FFFFFF' },
    })
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div style={{ marginTop: 48, animation: 'fadeInUp 500ms ease 2000ms forwards', opacity: 0 }}>
      <span
        style={{
          fontFamily: bodyFont,
          fontSize: 11,
          fontWeight: 500,
          color: THEME.night.muted,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          display: 'block',
          marginBottom: 16,
        }}
      >
        YOUR MEMBER QR
      </span>
      {svg ? (
        <div
          style={{ display: 'inline-block', lineHeight: 0, borderRadius: 8, overflow: 'hidden' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div style={{ width: 180, height: 180, borderRadius: 8, background: THEME.night.border }} />
      )}
      <p
        style={{
          fontFamily: bodyFont,
          fontSize: 13,
          color: THEME.night.muted,
          marginTop: 16,
          marginBottom: 0,
          letterSpacing: '0.04em',
        }}
      >
        We&apos;ll be in touch shortly.
      </p>
    </div>
  );
}

const EMPTY_FORM: FormData = {
  fullName: '', email: '', phone: '',
  foodAccessibility: '',
  photoUrls: [], agreedToTerms: false, consentEmail: false, consentSms: false,
};

// ---------------------------------------------------------------------------
// Chapter pagination - the questions module is the single source of truth for
// CONTENT; this map is the single source of truth for LAYOUT. The 40 questions
// are grouped into 6 chapter-pages. Nothing is cut, renamed, or duplicated -
// every id below resolves to a question in the module. Each page belongs to
// exactly one section, so the three section interstitials still fire only at
// the section boundaries (pages 1, 3, and 6).
// ---------------------------------------------------------------------------

const CHAPTER_PAGE_IDS: string[][] = [
  // Section 01 - Who You Are (pages follow module order; personality-test
  // questions kept together on Page 2). Photos close the identity page - the
  // natural end of "tell us who you are", per Adam's placement call.
  ['firstName', 'lastName', 'email', 'cell', 'homeAddress', 'cities', 'birthInfo', 'gender', 'dietary', 'links', 'photos'],
  ['whatYouDo', 'creativePursuits', 'referrals', 'enneagram', 'otherTests'],
  // Section 02 - How You Move Through the World
  ['lastConvinced', 'obsessedWith', 'recommendForPay', 'comeToYouFor', 'loyalBrands', 'expertIn'],
  ['splurgeSave', 'brandPartner', 'detailsRight', 'trustedTaste', 'recSources'],
  ['idealSaturday', 'workout', 'podcasts', 'scrollStopping', 'goodCompany', 'connectionCreated', 'loyalCommunity', 'karaoke'],
  // Section 03 - What You're Here For
  ['chapter', 'flowThrough', 'investedIn', 'friendDescribe', 'nominate'],
];

const QUESTION_BY_ID: Record<string, Question> = Object.fromEntries(
  QUESTIONS.map((q) => [q.id, q]),
);

function buildPages(): Question[][] {
  return CHAPTER_PAGE_IDS.map((ids) =>
    ids.map((id) => {
      const q = QUESTION_BY_ID[id];
      if (!q) throw new Error(`[apply] chapter map references unknown question id: ${id}`);
      return q;
    }),
  );
}

const PAGES = buildPages();

/** localStorage key for the logged-out draft-resume feature. */
const DRAFT_KEY = 'nobc-apply-draft';

// Debounce for save-as-you-type: 2s after the last keystroke. Long enough that a
// burst of typing collapses into ONE PATCH (not one per keystroke), short enough
// that at most ~2s of edits are ever at risk — and the beforeunload guard covers
// even that window.
const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * The single PATCH-answers call shared by save-on-advance (patchAndAdvance) and
 * autosave, so both persist through the exact same path/endpoint/body — autosave
 * is NOT a parallel save path. Returns the raw Response; callers own status
 * handling.
 */
function patchDraftAnswers(id: string, answers: Record<string, string>): Promise<Response> {
  return fetch(`/api/apply/membership/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
}
const QUESTION_STEPS = PAGES.length;
const LEGAL_STEP = QUESTION_STEPS;
const REVEAL_STEP = QUESTION_STEPS + 1;

// Photo picker limits - mirror the server caps in /api/apply/membership/upload
// (10MB, image-only). The picked File objects live in component state and are
// uploaded by the existing handleSubmit loop; nothing here touches that path.
const MAX_APPLY_PHOTOS = 5;
const APPLY_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const APPLY_PHOTO_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
/** Page hosting the `photo` question - guardedSubmit's re-route target. */
const PHOTO_PAGE_INDEX = PAGES.findIndex(page => page.some(q => q.type === 'photo'));
const PHOTO_REQUIRED = PAGES.some(page => page.some(q => q.type === 'photo' && q.required));

const SECTION_BY_ID = Object.fromEntries(SECTIONS.map(s => [s.id, s] as const));

/** Answer key for a simple field or a group sub-field. */
function answerKey(q: Question, sub?: SubField): string {
  return sub ? `${q.id}.${sub.id}` : q.id;
}

/** Every answer key a page reads/writes, used for validation + step resume. */
function keysForPage(page: Question[]): string[] {
  const keys: string[] = [];
  for (const q of page) {
    if (q.type === 'group') {
      for (const sub of q.fields ?? []) keys.push(answerKey(q, sub));
    } else if (q.type !== 'photo') {
      // `photo` questions hold File objects in component state, not answers -
      // the submit pipeline persists them under the fixed `photos.urls` key.
      keys.push(answerKey(q));
    }
  }
  return keys;
}

/** Furthest page index containing any answered key, capped at LEGAL_STEP. */
function stepFromAnswers(answers: Record<string, string>): number {
  let furthest = 0;
  PAGES.forEach((page, i) => {
    if (keysForPage(page).some(k => answers[k] !== undefined && answers[k] !== '')) {
      furthest = i;
    }
  });
  return Math.min(furthest, LEGAL_STEP);
}

/** A short plausible value for the dev/demo fill, per question/sub-field. */
function sampleValue(q: Question, sub?: SubField): string {
  const type = sub ? sub.type : q.type;
  const id = sub ? sub.id : q.id;
  if (id === 'firstName') return 'Jordan';
  if (id === 'lastName') return 'Voss';
  if (id === 'email') return `qa+${Date.now()}@nobc-dev.test`;
  if (id === 'cell') return `512-555-${String(Date.now()).slice(-4)}`;
  if (id === 'birthDate') return '1990-04-12';
  switch (type) {
    case 'email': return `qa+${Date.now()}@nobc-dev.test`;
    case 'tel': return `512-555-${String(Date.now()).slice(-4)}`;
    case 'url': return 'https://example.com';
    case 'date': return '1990-04-12';
    case 'time': return '08:30';
    case 'number': return '4';
    case 'select': return q.options?.[0] ?? 'Yes';
    case 'textarea':
      return 'A short, specific, honest answer for testing the application flow end to end.';
    default:
      return 'Sample answer';
  }
}

/**
 * Full-screen interstitial card shown at a section boundary. Eyebrow + big
 * serif title enter with a restrained fade + slow upward translate, staggered.
 * Motion is CSS-only (no framer-motion) and is suppressed under
 * prefers-reduced-motion. Mobile-safe: vertical motion only, safe-area padding.
 *
 * The `opening` variant (Section 01) carries the membership manifesto — the
 * italic lead line and the bold closing line — and does NOT auto-dismiss. The
 * applicant reads it and taps "Begin" to enter the form. Tap-anywhere dismissal
 * is disabled in this variant so the words can be read without an accidental
 * skip; the quick title-cards for later sections keep tap-anywhere.
 */
function SectionIntro({
  eyebrow,
  title,
  onDone,
  opening = false,
  lead,
  body,
  bold,
  accent = 'var(--primary)',
}: {
  eyebrow: string;
  title: string;
  onDone: () => void;
  opening?: boolean;
  lead?: string;
  body?: string[];
  bold?: string;
  accent?: string;
}) {
  return (
    <div
      onClick={opening ? undefined : onDone}
      className="apply-interstitial fixed inset-0 z-[70] flex flex-col items-center justify-center bg-bg px-6 text-center"
      style={{
        cursor: opening ? 'default' : 'pointer',
        paddingTop: 'max(env(safe-area-inset-top), 24px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
      }}
    >
      <span className="apply-interstitial-eyebrow mb-6 block text-xs font-medium uppercase tracking-[0.24em] text-primary">
        {eyebrow}
      </span>
      <h1 className="apply-interstitial-title font-display max-w-[14ch] text-4xl italic leading-tight text-text-primary sm:text-6xl">
        {title}
      </h1>
      {opening && (
        <>
          {lead && (
            <p className="font-display mt-8 max-w-[34ch] text-lg italic leading-relaxed text-text-primary sm:text-2xl">
              {lead}
            </p>
          )}
          {body &&
            body.map((para, i) => (
              <p key={i} className="mt-6 max-w-[40ch] text-[15px] leading-[1.75] text-text-secondary">
                {para}
              </p>
            ))}
          {bold && (
            <p className="mt-6 max-w-[42ch] text-sm font-semibold leading-snug text-text-primary sm:text-base">
              {bold}
            </p>
          )}
          <button
            type="button"
            onClick={onDone}
            className="mt-10 inline-flex min-h-[52px] items-center justify-center px-14 text-sm font-medium uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
            style={{ background: accent, color: '#ffffff' }}
          >
            Begin
          </button>
        </>
      )}
    </div>
  );
}

/** Section 01 focus-pull gate: play once per tab-session, never under reduced motion. */
function shouldPlayOpeningPull(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (sessionStorage.getItem('apply:openingPulled')) return false;
  } catch {
    return false;
  }
  return true;
}

export default function MembershipForm() {
  const searchParams = useSearchParams();
  const isDev = process.env.NODE_ENV === 'development' || searchParams.get('dev') === 'true';
  const isDemo = searchParams.get('demo') === 'true';

  const [isNight, setIsNight] = useState(false);
  const [step, setStep] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
  const [data, setData] = useState<FormData>(EMPTY_FORM);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [showFrogger, setShowFrogger] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  // Picker-local validation message (wrong type / too large / over the cap) -
  // separate from the page-level `error` so it renders beside the previews.
  const [photoError, setPhotoError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  // Autosave (F1): debounced save-as-you-type status + a JSON snapshot of the
  // last successfully autosaved answers, used to detect unsaved changes.
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const lastSavedAnswersRef = useRef<string>('');
  const [testDataLoaded, setTestDataLoaded] = useState(false);
  const [devHovered, setDevHovered] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [bannerFading, setBannerFading] = useState(false);
  const [interstitial, setInterstitial] = useState<{ eyebrow: string; title: string; opening?: boolean } | null>(null);
  // First-load focus-pull on Section 01: the header settles as the focus, then the
  // fields rise. Plays once per tab-session and is suppressed under reduced-motion.
  const [openingPull, setOpeningPull] = useState(false);
  // Speech-to-text (Web Speech API) - additive dictation on long-form fields only.
  const [speechSupported, setSpeechSupported] = useState(false);
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  // One-time "tap to speak" hint shown beside the first textarea field.
  const [micHintSeen, setMicHintSeen] = useState(false);
  // localStorage draft-resume prompt (logged-out applicants).
  const [draftPrompt, setDraftPrompt] = useState<{ answers: Record<string, string>; step: number; applicationId: string | null } | null>(null);

  const froggerBuffer = useRef('');
  const seenSections = useRef<Set<string>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  // Synchronous double-tap guard for the House Rules submit button (see guardedSubmit).
  const submittingRef = useRef(false);

  const theme = isNight ? THEME.night : THEME.day;

  function setAnswer(key: string, value: string) {
    setAnswers(prev => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    const stored = localStorage.getItem('nobc-apply-theme');
    if (stored === 'night') { setIsNight(true); return; }
    if (stored === 'day') return;
    const hour = new Date().getHours();
    if (hour >= 23 || hour < 4) setIsNight(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('nobc-apply-theme', isNight ? 'night' : 'day');
  }, [isNight]);

  // Sync the load-bearing identity fields from the answers map. These feed
  // patchAndAdvance's create call (POST expects fullName/email/phone).
  useEffect(() => {
    const fullName = `${answers.firstName ?? ''} ${answers.lastName ?? ''}`.trim();
    const email = answers.email ?? '';
    const phone = answers.cell ?? '';
    setData(prev => ({ ...prev, fullName, email, phone }));
  }, [answers.firstName, answers.lastName, answers.email, answers.cell]);

  const labelStyle: React.CSSProperties = {
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: 600,
    color: theme.text,
    letterSpacing: '0',
    lineHeight: 1.4,
    marginBottom: 10,
    display: 'block',
  };

  function getInputStyle(id: string): React.CSSProperties {
    const focused = focusedField === id;
    return {
      background: 'transparent',
      border: 'none',
      borderBottom: `1.5px solid ${focused ? theme.accent : theme.border}`,
      borderRadius: 0,
      padding: '8px 0 12px 0',
      fontSize: 17,
      fontFamily: bodyFont,
      color: theme.text,
      width: '100%',
      boxSizing: 'border-box',
      outline: 'none',
      caretColor: theme.accent,
      // Soft token focus ring under the editorial underline (primary-soft).
      boxShadow: focused ? `0 1px 0 0 var(--primary-soft)` : 'none',
      transition: 'border-color 200ms ease, box-shadow 200ms ease',
    };
  }

  function getTextareaStyle(id: string): React.CSSProperties {
    return { ...getInputStyle(id), resize: 'none', minHeight: 48, overflow: 'hidden' };
  }

  function autoResizeTextarea(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.max(48, el.scrollHeight) + 'px';
  }

  const chapterLabelStyle: React.CSSProperties = {
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: 500,
    color: theme.accent,
    letterSpacing: '0.12em',
    marginBottom: 8,
    display: 'block',
    textTransform: 'uppercase',
  };

  // Matches the page-title treatment (PP Editorial New italic) so the legal
  // screen's heading is consistent with every other section title.
  const sectionHeadingStyle: React.CSSProperties = {
    fontFamily: displayFont,
    fontSize: 'clamp(34px, 5vw, 52px)',
    fontWeight: 400,
    fontStyle: 'italic',
    lineHeight: 1.1,
    color: theme.text,
    margin: '0 0 16px 0',
  };

  const helpStyle: React.CSSProperties = {
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 1.65,
    color: theme.muted,
    margin: '0 0 14px 0',
  };

  // Single inter-field rhythm, ~30% tighter than the old 48px so short fields
  // (Section 01) stop reading stretched. Group sub-fields use the grid row-gap
  // instead of their own margin, so a group never leaves a double gap after it.
  const fieldGroup: React.CSSProperties = { marginBottom: 32 };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setShowFrogger(false); return; }
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      froggerBuffer.current = (froggerBuffer.current + e.key.toLowerCase()).slice(-7);
      if (froggerBuffer.current === 'frogger') {
        setShowFrogger(true);
        froggerBuffer.current = '';
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || isDemo) return;
    // The URL id is the source of truth for applicationId: adopt it up front,
    // independent of the GET rehydrate below. If the rehydrate fails (a 403 draft
    // this browser can't write, a 404, or a network error) the form still knows its
    // draft id, so the save paths PATCH the existing row instead of POST-creating a
    // duplicate. A genuinely unwritable draft still degrades to create-fresh via
    // patchAndAdvance's existing PATCH-403 handling. Runs in dev too (no isDev gate).
    setApplicationId(id);
    (async () => {
      try {
        const res = await fetch(`/api/apply/membership/${id}`);
        if (!res.ok) return;
        const { application, answers: loaded } = await res.json();
        setApplicationId(id);
        const ans: Record<string, string> = loaded ?? {};
        setAnswers(ans);
        setData(prev => ({
          ...prev,
          fullName: application.fullName ?? '',
          email: application.email ?? '',
          phone: application.phone ?? '',
          // Consent is captured at the front gate now; rehydrate it from the stored
          // application so the unchanged handleSubmit agreedToTerms gate passes on
          // resume without the removed LEGAL_STEP checkboxes. PHASE B: the gate now
          // reads the structured `agreedToMembershipTerms` signal. `consentEmail` is
          // kept as a BACKFILL fallback so drafts created before Phase B — which have
          // agreedToMembershipTerms=false but may have consentEmail=true — still pass
          // the gate on resume; the final-submit PATCH then persists
          // agreedToMembershipTerms=true server-side. consentSms is the optional opt-in.
          agreedToTerms: !!application.agreedToMembershipTerms || !!application.consentEmail,
          consentSms: !!application.consentSms,
        }));
        setStep(stepFromAnswers(ans));
        setShowResumeBanner(true);
      } catch { /* start fresh */ }
    })();
  }, [searchParams, isDemo]);

  useEffect(() => {
    if (!showResumeBanner) return;
    const fadeTimer = setTimeout(() => setBannerFading(true), 2500);
    const hideTimer = setTimeout(() => {
      setShowResumeBanner(false);
      setBannerFading(false);
    }, 3000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [showResumeBanner]);

  // Revoke preview object URLs on unmount only. Removal revokes its own URL at
  // the call site (removePhoto); revoking on every array change would kill URLs
  // that survive into the next array when a photo is added or removed.
  const photoPreviewUrlsRef = useRef<string[]>([]);
  photoPreviewUrlsRef.current = photoPreviewUrls;
  useEffect(() => {
    return () => { photoPreviewUrlsRef.current.forEach(u => URL.revokeObjectURL(u)); };
  }, []);

  /** Validate + accept newly picked files, capped at MAX_APPLY_PHOTOS. */
  function addPhotoFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const accepted: File[] = [];
    const urls: string[] = [];
    let problem = '';
    for (const file of Array.from(list)) {
      if (photoFiles.length + accepted.length >= MAX_APPLY_PHOTOS) {
        problem = `You can share up to ${MAX_APPLY_PHOTOS} photos.`;
        break;
      }
      if (!APPLY_PHOTO_TYPES.has(file.type)) {
        problem = `"${file.name}" isn't a JPG, PNG, or WebP - please pick a different photo.`;
        continue;
      }
      if (file.size > APPLY_PHOTO_MAX_BYTES) {
        problem = `"${file.name}" is over 10MB - please pick a smaller version.`;
        continue;
      }
      accepted.push(file);
      urls.push(URL.createObjectURL(file));
    }
    if (accepted.length > 0) {
      setPhotoFiles(prev => [...prev, ...accepted]);
      setPhotoPreviewUrls(prev => [...prev, ...urls]);
    }
    setPhotoError(problem);
  }

  function removePhoto(index: number) {
    const url = photoPreviewUrls[index];
    if (url) URL.revokeObjectURL(url);
    setPhotoFiles(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== index));
    setPhotoError('');
  }

  // Section interstitial: the first time a section's first page is reached,
  // show a full-screen card before the form. CSS handles the motion; we just
  // auto-dismiss after it settles (and a tap/click dismisses early).
  useEffect(() => {
    if (step >= LEGAL_STEP) return;
    const page = PAGES[step];
    const sectionId = page[0].section;
    const isFirstPageOfSection = step === 0 || PAGES[step - 1][0].section !== sectionId;
    if (!isFirstPageOfSection || seenSections.current.has(sectionId)) return;
    const section = SECTION_BY_ID[sectionId];
    const opening = sectionId === SECTIONS[0].id;
    // Returning applicants are dropped mid-form (resume via ?id= or a saved local
    // draft) and must NOT re-see the opening manifesto. Mark the section seen and
    // bail so it can't fire now or later this session. The later title-cards are
    // unaffected.
    if (opening) {
      const resuming =
        !!searchParams.get('id') ||
        (typeof window !== 'undefined' && !!window.localStorage.getItem(DRAFT_KEY));
      if (resuming) {
        seenSections.current.add(sectionId);
        return;
      }
    }
    seenSections.current.add(sectionId);
    setInterstitial({ eyebrow: section.eyebrow, title: section.title, opening });
    // The opening manifesto (Section 01) stays until the applicant taps "Begin".
    // The later section title-cards still auto-dismiss after they settle.
    if (opening) return;
    const t = setTimeout(() => setInterstitial(null), 2200);
    return () => clearTimeout(t);
  }, [step]);

  // --- Speech-to-text (Web Speech API) ---------------------------------------
  // Feature-detect after mount (avoids any SSR/CSR divergence). Browsers without
  // SpeechRecognition (Firefox, and Safari without the prefix) simply never get
  // the mic button; the textarea still works by typing.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) setSpeechSupported(true);
    return () => { try { recognitionRef.current?.stop?.(); } catch { /* noop */ } };
  }, []);

  // The mic hint is a once-ever affordance; remember dismissal across sessions.
  useEffect(() => {
    try { if (localStorage.getItem('nobc-apply-mic-hint') === '1') setMicHintSeen(true); } catch { /* noop */ }
  }, []);
  const dismissMicHint = useCallback(() => {
    setMicHintSeen(true);
    try { localStorage.setItem('nobc-apply-mic-hint', '1'); } catch { /* noop */ }
  }, []);

  const toggleDictation = useCallback((key: string) => {
    dismissMicHint();
    if (!speechSupported) return;
    if (recordingKey === key) { recognitionRef.current?.stop?.(); return; }
    try { recognitionRef.current?.stop?.(); } catch { /* noop */ }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    // Snapshot whatever is already typed; dictation appends to it so the user
    // keeps full editing control over the final text.
    const base = answers[key] ?? '';
    const sep = base && !/\s$/.test(base) ? ' ' : '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setAnswer(key, base + sep + transcript);
    };
    rec.onend = () => { setRecordingKey(null); recognitionRef.current = null; };
    rec.onerror = () => { setRecordingKey(null); recognitionRef.current = null; };
    recognitionRef.current = rec;
    setRecordingKey(key);
    try { rec.start(); } catch { setRecordingKey(null); recognitionRef.current = null; }
  }, [speechSupported, recordingKey, answers, dismissMicHint]);

  // Auto-dismiss the hint a few seconds after it first appears on a textarea page.
  useEffect(() => {
    if (micHintSeen || !speechSupported || step >= LEGAL_STEP) return;
    if (!PAGES[step]?.some(q => q.type === 'textarea')) return;
    const t = setTimeout(dismissMicHint, 7000);
    return () => clearTimeout(t);
  }, [step, micHintSeen, speechSupported, dismissMicHint]);

  // --- localStorage draft resume (logged-out applicants) ---------------------
  // Restore on load only when there is no server ?id= resume in flight and we
  // are not in demo/dev. We surface a prompt rather than silently jumping them.
  useEffect(() => {
    if (isDemo || isDev) return;
    if (searchParams.get('id')) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.answers && Object.keys(parsed.answers).length > 0) {
        setDraftPrompt({
          answers: parsed.answers,
          step: typeof parsed.step === 'number' ? parsed.step : 0,
          applicationId: parsed.applicationId ?? null,
        });
      }
    } catch { /* ignore a corrupt draft */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the draft to localStorage on every advance (step change).
  useEffect(() => {
    if (isDemo || isDev) return;
    if (step <= 0 || step >= REVEAL_STEP) return;
    if (Object.keys(answers).length === 0) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, step, applicationId }));
    } catch { /* quota / unavailable - non-fatal */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Autosave (F1): debounced save-as-you-type through the SAME path as
  // save-on-advance (patchDraftAnswers). Closes the mid-page data-loss gap —
  // previously the current page's answers only reached the server on advance.
  // Requires an existing draft (applicationId — set from ?id= for the
  // account-first flow); skips demo/dev and non-question steps.
  useEffect(() => {
    if (isDemo || isDev) return;
    if (!applicationId) return;
    if (step >= QUESTION_STEPS) return;
    if (Object.keys(answers).length === 0) return;
    const serialized = JSON.stringify(answers);
    if (serialized === lastSavedAnswersRef.current) return;
    const t = setTimeout(async () => {
      setAutosaveState('saving');
      try {
        const res = await patchDraftAnswers(applicationId, answers);
        if (res.ok) {
          lastSavedAnswersRef.current = serialized;
          setAutosaveState('saved');
        } else {
          setAutosaveState('idle');
        }
      } catch {
        setAutosaveState('idle');
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, applicationId, step]);

  // beforeunload guard (F1): warn on tab close / navigation when the current page
  // has answer edits newer than the last successful autosave.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (isDemo || isDev || !applicationId || step >= QUESTION_STEPS) return;
      if (Object.keys(answers).length === 0) return;
      if (JSON.stringify(answers) === lastSavedAnswersRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [answers, applicationId, step, isDemo, isDev]);

  // Clear the local draft once a submission has succeeded. Watching submitResult
  // keeps the submission handler itself byte-for-byte untouched.
  useEffect(() => {
    if (!submitResult) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
  }, [submitResult]);

  const resumeDraft = useCallback(() => {
    if (!draftPrompt) return;
    setAnswers(draftPrompt.answers);
    setApplicationId(draftPrompt.applicationId);
    setStep(Math.min(draftPrompt.step, LEGAL_STEP));
    setDraftPrompt(null);
  }, [draftPrompt]);

  const startFresh = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
    setDraftPrompt(null);
  }, []);

  const fillSample = useCallback(() => {
    const filled: Record<string, string> = {};
    for (const q of QUESTIONS) {
      if (q.type === 'photo') continue; // files, not text answers - nothing to fill
      if (q.type === 'group') {
        for (const sub of q.fields ?? []) filled[answerKey(q, sub)] = sampleValue(q, sub);
      } else {
        filled[answerKey(q)] = sampleValue(q);
      }
    }
    setAnswers(filled);
    setTestDataLoaded(true);
    setTimeout(() => setTestDataLoaded(false), 2000);
  }, []);

  useEffect(() => {
    if (!isDemo) return;
    fillSample();
  }, [isDemo, fillSample]);

  const advance = useCallback((nextStep: number) => {
    setIsTransitioning(true);
    setTransitionDirection(nextStep > step ? 'forward' : 'backward');
    setTimeout(() => {
      setStep(nextStep);
      setIsTransitioning(false);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, 400);
  }, [step]);

  const set = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setData(prev => ({ ...prev, [key]: value }));
  }, []);

  async function handleSaveDraft() {
    try {
      if (!applicationId) {
        if (!data.fullName.trim() || !data.email.trim()) return;
        const res = await fetch('/api/apply/membership', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: data.fullName, email: data.email, phone: data.phone, answers }),
        });
        if (res.ok) {
          const { id } = await res.json();
          setApplicationId(id as string);
          window.history.replaceState(null, '', '?id=' + id);
        }
      } else {
        await fetch(`/api/apply/membership/${applicationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        });
      }
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    } catch { /* silent */ }
  }

  async function patchAndAdvance(answers: Record<string, string>, nextStep: number) {
    setIsLoading(true);
    let id = applicationId;
    try {
      if (id) {
        const res = await patchDraftAnswers(id, answers);
        if (res.status === 403) {
          // This draft can't be saved from this browser — its access cookie is
          // missing or expired. Abandon the stale id and start a fresh draft
          // rather than looping on a save that will never succeed.
          id = null;
          setApplicationId(null);
        } else if (!res.ok) {
          // A swallowed PATCH means this page's answers never reach the server and
          // are lost from scoring/review. Surface it rather than advancing.
          throw new Error('save-failed');
        }
      }
      if (!id) {
        const res = await fetch('/api/apply/membership', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: data.fullName, email: data.email, phone: data.phone, answers }),
        });
        // A failed create leaves us with no applicationId. Advancing here would
        // walk the applicant through the entire form only for submit to silently
        // no-op (handleSubmit early-returns when applicationId is null). Block on
        // failure and let them retry this page instead.
        if (!res.ok) throw new Error('save-failed');
        const result = await res.json();
        id = result.id as string;
        setApplicationId(id);
        const newUrl = isDemo ? `?id=${id}&demo=true` : isDev ? `?id=${id}&dev=true` : `?id=${id}`;
        window.history.replaceState(null, '', newUrl);
      }
    } catch {
      setIsLoading(false);
      setError("We couldn't save your progress. Please check your connection and try again.");
      return;
    }
    setError('');
    setIsLoading(false);
    advance(nextStep);
  }

  async function handleSubmit() {
    if (!data.agreedToTerms || !applicationId) return;
    setError('');
    setIsLoading(true);
    try {
      // Upload returns a private R2 object key (not a public URL); the operator
      // review surfaces resolve it through the role-gated presign proxy.
      // A failed upload must NOT be silently swallowed — losing a photo the
      // applicant chose to share is a data-loss bug. Surface it and block the
      // submission so they can retry, rather than landing an empty photo key.
      const uploadedUrls: string[] = [];
      for (const file of photoFiles) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          const r = await fetch('/api/apply/membership/upload', { method: 'POST', body: fd });
          if (!r.ok) {
            const detail = await r.json().catch(() => null);
            throw new Error(detail?.error || `Photo upload failed (${r.status}).`);
          }
          const { key } = await r.json();
          if (!key) throw new Error('Photo upload failed.');
          uploadedUrls.push(key);
        } catch (uploadErr) {
          console.error('[apply/photo-upload]', uploadErr);
          throw new Error(
            uploadErr instanceof Error && uploadErr.message
              ? `${uploadErr.message} Please try a different photo or remove it and resubmit.`
              : 'One of your photos could not be uploaded. Please try a different photo or remove it and resubmit.',
          );
        }
      }

      const patchRes = await fetch(`/api/apply/membership/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // PHASE C: three independent House Rules consents. No legacy `consentEmail`.
          agreedToMembershipTerms: data.agreedToTerms,
          emailOptIn: data.consentEmail,
          consentSms: data.consentSms,
          answers: { 'photos.urls': JSON.stringify(uploadedUrls), 'photos.foodAccessibility': data.foodAccessibility },
        }),
      });
      if (!patchRes.ok) throw new Error('Failed to save consent.');

      const submitRes = await fetch(`/api/apply/membership/${applicationId}/submit`, { method: 'POST' });
      if (!submitRes.ok) throw new Error('Failed to submit application.');
      const result = await submitRes.json();
      setSubmitResult(result);
      setData(prev => ({ ...prev, photoUrls: uploadedUrls }));
      setStep(REVEAL_STEP);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  }

  // Synchronous double-tap guard for the submit button. isLoading (set inside the
  // frozen handleSubmit) already disables the button, shows an in-flight label, and
  // re-enables on failure via its finally - but isLoading is React state and flushes
  // a render later, so it can't block a second invocation fired in the same tick.
  // This ref does, synchronously. It matters because submit has billed, irreversible
  // side effects (two Sonnet calls + a welcome email; the server's aiScore idempotency
  // check can be raced by two near-simultaneous POSTs). Wraps handleSubmit at the call
  // site; handleSubmit is unchanged. handleSubmit catches its own errors, so the await
  // resolves either way and finally clears the ref (a successful submit unmounts this
  // page, making the reset a harmless no-op).
  async function guardedSubmit() {
    // Photo backstop: a resumed draft can land directly on House Rules with the
    // picker empty (File objects never survive a reload). Send the applicant
    // back to the photo page instead of submitting a photo-less application.
    // Demo mode keeps its no-validation walkthrough. handleSubmit is unchanged.
    if (!isDemo && PHOTO_REQUIRED && photoFiles.length === 0) {
      setError('Please add at least one photo to finish your application.');
      advance(PHOTO_PAGE_INDEX);
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await handleSubmit();
    } finally {
      submittingRef.current = false;
    }
  }

  function generateShareCard() {
    if (!submitResult) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0d0d0f';
    ctx.fillRect(0, 0, 1080, 1080);

    ctx.fillStyle = '#ffffff';
    ctx.font = '500 18px Helvetica Neue, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '0.2em';
    ctx.fillText('THE NO BAD COMPANY', 540, 120);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 140px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(submitResult.archetype, 540, 520);

    const oneLiner = ARCHETYPES[submitResult.archetype as ArchetypeName]?.oneLiner ?? '';
    ctx.font = '32px Helvetica Neue, Arial, sans-serif';
    ctx.fillStyle = '#9e9a9a';
    ctx.fillText(oneLiner, 540, 600);

    const topTags = (submitResult.tags ?? []).slice(0, 2);
    if (topTags.length > 0) {
      ctx.fillStyle = '#B22E21';
      ctx.font = '500 24px Helvetica Neue, Arial, sans-serif';
      ctx.fillText(topTags.join('  ·  ').toUpperCase(), 540, 900);
    }

    ctx.fillStyle = '#666666';
    ctx.font = '16px Helvetica Neue, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('nobc-os.vercel.app/apply', 1040, 1040);

    const safeName = data.fullName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'member';
    const link = document.createElement('a');
    link.download = `my-archetype-${safeName}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function navBlock(onNext: () => void, nextLabel = 'continue →', nextDisabled = false) {
    return (
      <div style={{ marginTop: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <button onClick={handleSaveDraft} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: bodyFont, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: draftSaved ? theme.accent : theme.muted, opacity: draftSaved ? 1 : 0.5, transition: 'color 200ms, opacity 200ms' }}>
            {draftSaved ? 'saved.' : 'save draft'}
          </button>
        </div>
        {autosaveState !== 'idle' && (
          <div
            aria-live="polite"
            style={{ textAlign: 'center', marginBottom: 12, fontFamily: bodyFont, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: theme.muted, opacity: 0.6 }}
          >
            {autosaveState === 'saving' ? 'Saving...' : 'Saved'}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {step > 0 ? (
            <button onClick={() => { setIsTransitioning(true); setTransitionDirection('backward'); setTimeout(() => { setStep(s => Math.max(0, s - 1)); setIsTransitioning(false); window.scrollTo({ top: 0, behavior: 'instant' }); }, 400); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: bodyFont, fontSize: 15, fontWeight: 500, letterSpacing: '0.06em', color: theme.muted, padding: '8px 4px', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1 }}
              aria-label="Go back">
              <span style={{ fontSize: 22, lineHeight: 1 }}>&#8249;</span> back
            </button>
          ) : <div />}
          <button
            style={{
              background: nextDisabled || isLoading ? theme.border : theme.accent,
              color: nextDisabled || isLoading ? theme.muted : '#ffffff',
              border: 'none',
              borderRadius: 0,
              padding: '0 32px',
              height: 52,
              fontSize: 14,
              fontFamily: bodyFont,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: nextDisabled || isLoading ? 'not-allowed' : 'pointer',
              width: '100%',
              maxWidth: 400,
              transition: 'opacity 150ms ease',
            }}
            onClick={onNext}
            disabled={nextDisabled || isLoading}
            onMouseEnter={e => { if (!nextDisabled && !isLoading) (e.target as HTMLElement).style.opacity = '0.9'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.opacity = '1'; }}
          >
            {isLoading ? '...' : nextLabel}
          </button>
        </div>
      </div>
    );
  }

  const archetypeData = submitResult ? ARCHETYPES[submitResult.archetype as ArchetypeName] : null;
  const dayStory = archetypeData?.dayStory ?? '';
  const nightStory = archetypeData?.nightStory ?? '';
  // The AI personalization (empty when scoring fell back). Do NOT default to
  // dayStory — that made "YOUR STORY" render a verbatim copy of "BY DAY".
  const personalizedStory = (submitResult?.personalizedCopy ?? '').trim();

  // ----- Generic question rendering -----

  function renderSimpleInput(q: Question, key: string, showHint = false) {
    const value = answers[key] ?? '';
    if (q.type === 'photo') {
      const atCapacity = photoFiles.length >= MAX_APPLY_PHOTOS;
      return (
        <div>
          {photoPreviewUrls.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
              {photoPreviewUrls.map((url, i) => (
                <div key={url} style={{ position: 'relative', width: 96, height: 96 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote asset */}
                  <img
                    src={url}
                    alt={`Your photo ${i + 1}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    aria-label={`Remove photo ${i + 1}`}
                    style={{
                      position: 'absolute',
                      top: -10,
                      right: -10,
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: theme.text,
                      color: theme.bg,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 15,
                      lineHeight: 1,
                      fontFamily: bodyFont,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            id={`${key}-input`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={e => { addPhotoFiles(e.target.files); e.currentTarget.value = ''; }}
          />
          <button
            type="button"
            id={key}
            onClick={() => document.getElementById(`${key}-input`)?.click()}
            disabled={atCapacity}
            onFocus={() => setFocusedField(key)}
            onBlur={() => setFocusedField(null)}
            style={{
              background: 'transparent',
              color: atCapacity ? theme.muted : theme.text,
              border: `1.5px solid ${focusedField === key ? theme.accent : theme.border}`,
              borderRadius: 0,
              padding: '0 24px',
              minHeight: 48,
              fontSize: 13,
              fontFamily: bodyFont,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: atCapacity ? 'not-allowed' : 'pointer',
              transition: 'border-color 200ms ease, color 200ms ease',
            }}
          >
            {atCapacity ? 'photo limit reached' : photoFiles.length > 0 ? '+ add another photo' : '+ add photos'}
          </button>
          <p style={{ fontFamily: bodyFont, fontSize: 12, color: theme.muted, margin: '10px 0 0 0', letterSpacing: '0.04em' }}>
            {photoFiles.length} of {MAX_APPLY_PHOTOS} added
          </p>
          {photoError && (
            <p role="alert" style={{ color: theme.accent, fontFamily: bodyFont, fontSize: 13, margin: '10px 0 0 0' }}>
              {photoError}
            </p>
          )}
        </div>
      );
    }
    if (q.type === 'textarea') {
      const recording = recordingKey === key;
      return (
        <div style={{ position: 'relative' }}>
          <textarea
            id={key}
            style={{ ...getTextareaStyle(key), paddingRight: speechSupported ? 30 : undefined }}
            ref={el => { if (el) autoResizeTextarea(el); }}
            onInput={e => autoResizeTextarea(e.currentTarget)}
            onFocus={() => setFocusedField(key)}
            onBlur={() => setFocusedField(null)}
            rows={1}
            value={value}
            onChange={e => setAnswer(key, e.target.value)}
          />
          {speechSupported && (
            <button
              type="button"
              onClick={() => toggleDictation(key)}
              aria-label={recording ? 'Stop dictation' : 'Dictate your answer'}
              aria-pressed={recording}
              title={recording ? 'Stop dictation' : 'Dictate your answer'}
              style={{
                // 44x44 tap target (Apple touch minimum); the visible 16px glyph
                // is centered so it stays where it was (~bottom-right of the field).
                position: 'absolute',
                right: -10,
                bottom: 2,
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: recording ? theme.accent : theme.muted,
                transition: 'color 200ms ease',
                animation: recording ? 'micPulse 1.2s ease-in-out infinite' : 'none',
              }}
            >
              <Mic size={16} strokeWidth={1.75} />
            </button>
          )}
          {showHint && (
            <p style={{
              margin: '10px 0 0 0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: bodyFont,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: theme.accent,
              animation: 'fadeIn 500ms ease',
            }}>
              <Mic size={12} strokeWidth={2} /> Tap to speak your answer
            </p>
          )}
        </div>
      );
    }
    if (q.type === 'select') {
      return (
        <select
          id={key}
          style={{ ...getInputStyle(key), colorScheme: isNight ? 'dark' : 'light', appearance: 'none' }}
          onFocus={() => setFocusedField(key)}
          onBlur={() => setFocusedField(null)}
          value={value}
          onChange={e => setAnswer(key, e.target.value)}
        >
          <option value="" disabled>Select…</option>
          {(q.options ?? []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }
    const inputType =
      q.type === 'email' ? 'email'
      : q.type === 'tel' ? 'tel'
      : q.type === 'url' ? 'url'
      : q.type === 'number' ? 'number'
      : q.type === 'date' ? 'date'
      : q.type === 'time' ? 'time'
      : 'text';
    return (
      <input
        id={key}
        style={inputType === 'date' || inputType === 'time'
          ? { ...getInputStyle(key), colorScheme: isNight ? 'dark' : 'light' }
          : getInputStyle(key)}
        onFocus={() => setFocusedField(key)}
        onBlur={() => setFocusedField(null)}
        type={inputType}
        value={value}
        onChange={e => setAnswer(key, e.target.value)}
      />
    );
  }

  function renderSubInput(q: Question, sub: SubField) {
    const key = answerKey(q, sub);
    const value = answers[key] ?? '';
    const inputType =
      sub.type === 'email' ? 'email'
      : sub.type === 'tel' ? 'tel'
      : sub.type === 'url' ? 'url'
      : sub.type === 'number' ? 'number'
      : sub.type === 'date' ? 'date'
      : sub.type === 'time' ? 'time'
      : 'text';
    return (
      <input
        id={key}
        style={inputType === 'date' || inputType === 'time'
          ? { ...getInputStyle(key), colorScheme: isNight ? 'dark' : 'light' }
          : getInputStyle(key)}
        onFocus={() => setFocusedField(key)}
        onBlur={() => setFocusedField(null)}
        type={inputType}
        placeholder={sub.placeholder}
        value={value}
        onChange={e => setAnswer(key, e.target.value)}
      />
    );
  }

  function renderQuestion(q: Question, hintKey: string | null = null) {
    if (q.type === 'group') {
      return (
        <div key={q.id} style={fieldGroup}>
          <label style={labelStyle}>{q.label}</label>
          {q.help && <p style={helpStyle}>{q.help}</p>}
          {/* One column on phones, two columns from 600px up (see .apply-group-grid). */}
          <div className="apply-group-grid" style={{ marginTop: 12 }}>
            {(q.fields ?? []).map(sub => (
              <div key={sub.id}>
                {sub.label && <label style={{ ...labelStyle, fontSize: 12, fontWeight: 500, color: theme.muted }}>{sub.label}{sub.required && <span style={{ color: theme.accent }}> *</span>}</label>}
                {renderSubInput(q, sub)}
              </div>
            ))}
          </div>
        </div>
      );
    }
    const key = answerKey(q);
    return (
      <div key={q.id} style={fieldGroup}>
        <label style={labelStyle}>{q.label}{q.required && <span style={{ color: theme.accent }}> *</span>}</label>
        {q.help && <p style={helpStyle}>{q.help}</p>}
        {renderSimpleInput(q, key, hintKey === key)}
      </div>
    );
  }

  /** The required fields still empty on a page, as {key, label}. Single source of
   *  truth for the required-field rule — it drives F2's specific validation
   *  message, F3's focus target (first key), AND submitPage's advance gate, so
   *  they can never diverge. The rule is unchanged: a required simple field or
   *  required group sub-field must be non-empty after trim (allowNone questions
   *  accept "none" elsewhere). */
  function missingRequiredFields(page: Question[]): { key: string; label: string }[] {
    const missing: { key: string; label: string }[] = [];
    for (const q of page) {
      if (q.type === 'group') {
        for (const sub of q.fields ?? []) {
          const k = answerKey(q, sub);
          if (sub.required && !(answers[k] ?? '').trim()) {
            missing.push({ key: k, label: sub.label ?? q.label });
          }
        }
      } else if (q.type === 'photo') {
        // Photos are Files in state, not answers - required means at least one.
        if (q.required && photoFiles.length === 0) {
          missing.push({ key: q.id, label: q.label });
        }
      } else if (q.required) {
        const k = answerKey(q);
        if (!(answers[k] ?? '').trim()) missing.push({ key: k, label: q.label });
      }
    }
    return missing;
  }

  function answersForPage(page: Question[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of keysForPage(page)) {
      out[key] = answers[key] ?? '';
    }
    return out;
  }

  // F3: send the eye (and keyboard focus) to a field by its answer-key id.
  // preventScroll avoids fighting the smooth scrollIntoView. Independent of the
  // F1 autosave effect — this only reads the DOM and moves focus; it never
  // mutates `answers`, so an autosave firing mid-correction can't disrupt it.
  function focusField(key: string) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(key);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el as HTMLElement).focus({ preventScroll: true });
  }

  function submitPage(pageIndex: number) {
    const page = PAGES[pageIndex];
    if (!isDemo) {
      const missing = missingRequiredFields(page);
      if (missing.length > 0) {
        // F2: name the specific missing fields instead of a generic banner.
        const labels = missing.map(f => f.label);
        const shown = labels.slice(0, 3);
        const extra = labels.length - shown.length;
        const list = shown.join(', ') + (extra > 0 ? `, and ${extra} more` : '');
        setError(`Please answer: ${list}.`);
        // F3: focus + scroll to the first missing field, not just a banner.
        focusField(missing[0].key);
        return;
      }
    }
    setError('');
    patchAndAdvance(answersForPage(page), pageIndex + 1);
  }

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInLeft {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes barGrow {
          from { width: 0; }
        }
        @keyframes editorialRise {
          from { opacity: 0; transform: translateY(28px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .apply-interstitial { animation: fadeIn 360ms ease forwards; }
        .apply-interstitial-eyebrow {
          opacity: 0;
          animation: editorialRise 720ms cubic-bezier(0.16, 1, 0.3, 1) 120ms forwards;
        }
        .apply-interstitial-title {
          opacity: 0;
          animation: editorialRise 780ms cubic-bezier(0.16, 1, 0.3, 1) 260ms forwards;
        }
        .apply-page-enter {
          opacity: 0;
          animation: fadeIn 420ms ease forwards;
        }
        /* Section 01 first-load focus-pull: header settles (~500ms), holds (~500ms),
           then the fields rise. Class is applied on Begin; see openingPull. */
        @keyframes openingCopyIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes openingFieldsIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .apply-opening-copy {
          opacity: 0;
          animation: openingCopyIn 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .apply-opening-fields {
          opacity: 0;
          transform: translateY(12px);
          animation: openingFieldsIn 600ms cubic-bezier(0.16, 1, 0.3, 1) 1000ms forwards;
        }
        @keyframes micPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        /* Group sub-fields: single column on phones, two columns from 600px up. */
        .apply-group-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 18px 24px; /* tight row-gap when stacked on phones */
        }
        @media (min-width: 600px) {
          .apply-group-grid {
            grid-template-columns: repeat(2, 1fr);
            row-gap: 28px; /* roomier on desktop, still tighter than the old 48 */
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .apply-interstitial,
          .apply-interstitial-eyebrow,
          .apply-interstitial-title,
          .apply-page-enter,
          .apply-opening-copy,
          .apply-opening-fields {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
        /* Suppress the browser-native autofill / contacts / credentials glyphs
           (the blue icons) inside the editorial inputs - OS/browser chrome we
           don't control, not part of the design. Typing/autofill still work. */
        .apply-form input::-webkit-contacts-auto-fill-button,
        .apply-form input::-webkit-credentials-auto-fill-button,
        .apply-form textarea::-webkit-contacts-auto-fill-button,
        .apply-form textarea::-webkit-credentials-auto-fill-button {
          visibility: hidden !important;
          display: none !important;
          pointer-events: none !important;
          position: absolute;
          right: 0;
        }
        @keyframes draftToastIn {
          from { opacity: 0; transform: translate(-50%, 8px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
      <div className="apply-form" style={{ background: theme.bg, minHeight: '100vh', fontFamily: bodyFont, color: theme.text, transition: 'background 300ms ease, color 300ms ease' }}>

      {/* Transient "Draft saved" confirmation. Render-only: reads the existing
          `draftSaved` flag set by handleSaveDraft (unchanged), whose own 2s reset
          dismisses it. Complements the in-button "saved." label with a visible toast. */}
      {draftSaved && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 'calc(24px + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            background: theme.text,
            color: theme.bg,
            fontFamily: bodyFont,
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '12px 22px',
            borderRadius: 999,
            pointerEvents: 'none',
            animation: 'draftToastIn 220ms ease',
          }}
        >
          Draft saved
        </div>
      )}

      {/* Section interstitial */}
      {interstitial && step < REVEAL_STEP && (
        <SectionIntro
          eyebrow={interstitial.eyebrow}
          title={interstitial.title}
          onDone={() => {
            const playPull = interstitial?.opening === true && shouldPlayOpeningPull();
            setInterstitial(null);
            if (playPull) {
              try { sessionStorage.setItem('apply:openingPulled', '1'); } catch {}
              setOpeningPull(true);
            }
          }}
          opening={interstitial.opening}
          lead={interstitial.opening ? INTRO.lead : undefined}
          body={interstitial.opening ? INTRO.body : undefined}
          bold={interstitial.opening ? INTRO.bold : undefined}
          accent={theme.accent}
        />
      )}

      {/* DEMO badge */}
      {isDemo && step < REVEAL_STEP && (
        <div style={{
          position: 'fixed',
          top: 14,
          right: 14,
          zIndex: 100,
          background: theme.accent,
          color: '#ffffff',
          fontSize: 10,
          fontFamily: bodyFont,
          fontWeight: 500,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          padding: '4px 10px',
          borderRadius: 0,
        }}>
          DEMO
        </div>
      )}

      {/* Section progress is now shown by the global bar anchored to the header nav. */}

      {/* Resume banner */}
      {showResumeBanner && (
        <div
          onClick={() => setShowResumeBanner(false)}
          style={{
            position: 'fixed', top: 2, left: 0, right: 0, zIndex: 61,
            background: theme.accent, color: '#fff',
            textAlign: 'center', padding: '8px 16px',
            fontFamily: bodyFont, fontSize: 12, cursor: 'pointer',
            letterSpacing: '0.04em', textTransform: 'uppercase',
            opacity: bannerFading ? 0 : 1,
            transition: 'opacity 0.5s ease',
          }}
        >
          Welcome back. Your draft is saved. <span style={{ opacity: 0.7, marginLeft: 8 }}>&times;</span>
        </div>
      )}

      {/* localStorage draft-resume prompt (logged-out applicants, no ?id= link) */}
      {draftPrompt && step === 0 && (
        <div style={{
          position: 'fixed', left: 16, right: 16, bottom: 'max(env(safe-area-inset-bottom), 16px)',
          zIndex: 80, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{
            pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, width: '100%', maxWidth: 440,
            background: theme.bg, border: `1px solid ${theme.border}`,
            boxShadow: '0 8px 28px rgba(0,0,0,0.14)', padding: '12px 16px',
          }}>
            <span style={{ fontFamily: bodyFont, fontSize: 13, color: theme.text, lineHeight: 1.4 }}>
              Welcome back - resume your application?
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button onClick={startFresh} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: bodyFont,
                fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: theme.muted,
              }}>
                Start fresh
              </button>
              <button onClick={resumeDraft} style={{
                background: theme.accent, color: '#ffffff', border: 'none', cursor: 'pointer',
                fontFamily: bodyFont, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em',
                textTransform: 'uppercase', padding: '8px 14px', minHeight: 36,
              }}>
                Resume
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <nav style={{
        position: 'sticky', top: 0, left: 0, right: 0, zIndex: 50,
        height: 56, padding: '0 24px', paddingTop: 'env(safe-area-inset-top)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: theme.bg,
      }}>
        <Link href="/" style={{ fontFamily: displayFont, fontSize: 15, fontWeight: 400, fontStyle: 'italic', color: theme.accent, textDecoration: 'none', letterSpacing: '0.02em' }}>The No Bad Company</Link>
        <button onClick={() => setIsNight(n => !n)} style={{
          background: 'none',
          border: `1px solid ${theme.border}`,
          borderRadius: 0,
          cursor: 'pointer',
          fontSize: 14,
          padding: '6px 10px',
          minHeight: 44,
          minWidth: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'border-color 200ms ease',
        }}>
          <span style={{ opacity: isNight ? 0.4 : 1, transition: 'opacity 200ms ease', fontSize: 13 }}>&#9728;&#65039;</span>
          <span style={{ opacity: isNight ? 1 : 0.4, transition: 'opacity 200ms ease', fontSize: 13 }}>&#127769;</span>
        </button>

        {/* Global progress bar - tracks the 6 chapter pages (Page 1 = 1/6 ... legal = full). */}
        {step < REVEAL_STEP && (
          <div
            aria-hidden
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: theme.border }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.round((step < QUESTION_STEPS ? (step + 1) / QUESTION_STEPS : 1) * 100)}%`,
                background: theme.accent,
                transition: 'width 450ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          </div>
        )}
      </nav>

      <main style={{
        minHeight: 'calc(100vh - 56px)',
        color: theme.text,
        padding: step === 0 || step === REVEAL_STEP ? '0' : '60px 24px 100px 24px',
        transform: isTransitioning ? (transitionDirection === 'forward' ? 'translateY(-100%)' : 'translateY(100%)') : 'translateY(0)',
        opacity: isTransitioning ? 0 : 1,
        transition: 'transform 400ms ease, opacity 400ms ease',
      }}>

        {/* QUESTION PAGES */}
        {step < LEGAL_STEP && (() => {
          const page = PAGES[step];
          const section = SECTION_BY_ID[page[0].section];
          const isFirstPageOfSection = step === 0 || PAGES[step - 1][0].section !== page[0].section;
          // The one-time mic hint attaches to the first textarea on this page.
          const firstTextarea = page.find(q => q.type === 'textarea');
          const hintKey = speechSupported && !micHintSeen && firstTextarea ? firstTextarea.id : null;
          // First-load focus-pull: pull focus to the Section 01 header, then rise the fields.
          const openingFirstLoad = step === 0 && openingPull;
          return (
            <div
              key={step}
              className="apply-page-enter"
              style={{
                maxWidth: 620,
                width: '100%',
                margin: '0 auto',
                padding: step === 0 ? '56px 24px 120px 24px' : undefined,
              }}
            >
              <div className={openingFirstLoad ? 'apply-opening-copy' : undefined}>
                <span style={chapterLabelStyle}>{section.eyebrow}</span>
                {/* The full serif title appears only on a section's first page -
                    the interstitial owns the section moment. On continuation
                    pages the small uppercase eyebrow above carries orientation. */}
                {isFirstPageOfSection ? (
                  <h1 style={{
                    fontFamily: displayFont,
                    fontSize: 'clamp(34px, 5vw, 52px)',
                    fontWeight: 400,
                    fontStyle: 'italic',
                    lineHeight: 1.1,
                    color: theme.text,
                    margin: '0 0 48px 0',
                  }}>{section.title}</h1>
                ) : (
                  <div style={{ height: 28 }} />
                )}
              </div>

              <div className={openingFirstLoad ? 'apply-opening-fields' : undefined}>
                {page.map((q) => renderQuestion(q, hintKey))}

                {error && <p style={{ color: theme.accent, fontFamily: bodyFont, fontSize: 13, marginBottom: 16 }}>{error}</p>}
                {navBlock(() => submitPage(step))}
              </div>
            </div>
          );
        })()}

        {/* SCREEN 7: House Rules — membership terms + the two optional opt-ins as
            three independent checkboxes, right before submit. Labels are rendered
            verbatim from CONSENT_DISCLOSURES so what the applicant reads is exactly
            what termsVersion pins on the row. The required terms box gates submit;
            email + SMS are optional and never bundled (TCPA). */}
        {step === LEGAL_STEP && (() => {
          const disclosures = CONSENT_DISCLOSURES[TERMS_VERSION];
          const consentRowStyle: React.CSSProperties = {
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            cursor: 'pointer',
            fontFamily: bodyFont,
            fontSize: 14,
            lineHeight: 1.55,
            color: theme.text,
            marginBottom: 18,
          };
          const checkboxStyle: React.CSSProperties = {
            marginTop: 2,
            width: 18,
            height: 18,
            flexShrink: 0,
            accentColor: theme.accent,
            cursor: 'pointer',
          };
          const linkStyle: React.CSSProperties = {
            color: theme.accent,
            textDecoration: 'underline',
            textUnderlineOffset: 2,
          };
          return (
            <div style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
              <span style={chapterLabelStyle}>HOUSE RULES</span>
              <h1 style={sectionHeadingStyle}>A few house rules</h1>

              <p style={{ ...helpStyle, marginBottom: 28 }}>
                No Bad Company is a private club, so membership comes with a short set of house rules.
                The short version: we decide who joins at our discretion, you must be 18 or older, we
                protect your information and never sell it, and our events may be photographed. The
                full detail lives in our{' '}
                <Link href="/terms" style={linkStyle}>membership terms</Link> and{' '}
                <Link href="/privacy" style={linkStyle}>privacy policy</Link>.
              </p>

              <label style={consentRowStyle}>
                <input
                  type="checkbox"
                  checked={data.agreedToTerms}
                  onChange={e => setData(prev => ({ ...prev, agreedToTerms: e.target.checked }))}
                  style={checkboxStyle}
                />
                <span>{disclosures.membershipTerms}</span>
              </label>
              <label style={consentRowStyle}>
                <input
                  type="checkbox"
                  checked={data.consentEmail}
                  onChange={e => setData(prev => ({ ...prev, consentEmail: e.target.checked }))}
                  style={checkboxStyle}
                />
                <span>{disclosures.emailOptIn}</span>
              </label>
              <label style={{ ...consentRowStyle, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={data.consentSms}
                  onChange={e => setData(prev => ({ ...prev, consentSms: e.target.checked }))}
                  style={checkboxStyle}
                />
                <span>{disclosures.smsOptIn}</span>
              </label>

              {/* F4: plain-language irreversibility notice, added alongside the
                  consent language (consent text / checkboxes / wiring untouched). */}
              <p
                style={{
                  fontFamily: bodyFont,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: theme.muted,
                  borderTop: `1px solid ${theme.border}`,
                  paddingTop: 20,
                  marginTop: 12,
                  marginBottom: 0,
                }}
              >
                Once you submit, your application is final - you won&apos;t be able to change your
                answers. Take a moment to make sure it reads the way you want.
              </p>

              {error && <p style={{ color: theme.accent, fontFamily: bodyFont, fontSize: 13, marginBottom: 16 }}>{error}</p>}
              {navBlock(guardedSubmit, 'submit my application', !data.agreedToTerms)}
            </div>
          );
        })()}

        {/* SCREEN 8: Reveal */}
        {step === REVEAL_STEP && submitResult && Object.keys(submitResult.archetypeScores ?? {}).length > 0 && (
          <div style={{
            minHeight: '100vh',
            background: 'var(--bg-reveal)',
            color: 'var(--text-night)',
            fontFamily: bodyFont,
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              minHeight: '100vh',
            }}>
              {/* Left Column — 58% */}
              <div style={{
                flex: '1 1 58%',
                minWidth: 320,
                padding: 'clamp(60px, 8vw, 100px) clamp(24px, 5vw, 60px)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
              }}>
                <span style={{
                  fontFamily: bodyFont,
                  fontSize: 11,
                  fontWeight: 500,
                  color: THEME.night.muted,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: 16,
                  display: 'block',
                  animation: 'fadeInUp 500ms ease 0ms forwards',
                  opacity: 0,
                }}>
                  YOUR ARCHETYPE
                </span>

                <h1 style={{
                  fontFamily: displayFont,
                  fontSize: 'clamp(72px, 10vw, 140px)',
                  fontWeight: 400,
                  fontStyle: 'italic',
                  color: THEME.night.text,
                  lineHeight: 0.95,
                  margin: '0 0 24px 0',
                  overflowWrap: 'break-word',
                  animation: 'fadeInUp 500ms ease 0ms forwards',
                  opacity: 0,
                }}>
                  {submitResult.archetype}
                </h1>

                <p style={{
                  fontFamily: bodyFont,
                  fontSize: 18,
                  fontWeight: 400,
                  color: THEME.night.muted,
                  maxWidth: 480,
                  marginBottom: 0,
                  marginTop: 0,
                  lineHeight: 1.5,
                  animation: 'fadeInUp 500ms ease 400ms forwards',
                  opacity: 0,
                }}>
                  {archetypeData?.oneLiner ?? ''}
                </p>

                <div style={{ height: 48 }} />

                <div style={{
                  marginBottom: 32,
                  animation: 'fadeInUp 500ms ease 800ms forwards',
                  opacity: 0,
                }}>
                  <span style={{
                    fontFamily: bodyFont,
                    fontSize: 11,
                    fontWeight: 500,
                    color: THEME.night.accent,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 12,
                  }}>BY DAY</span>
                  <p style={{
                    fontFamily: displayFont,
                    fontSize: 20,
                    fontStyle: 'italic',
                    lineHeight: 1.8,
                    color: THEME.night.text,
                    maxWidth: 520,
                    margin: 0,
                  }}>{dayStory}</p>
                </div>

                <div style={{
                  marginBottom: 32,
                  animation: 'fadeInUp 500ms ease 1200ms forwards',
                  opacity: 0,
                }}>
                  <span style={{
                    fontFamily: bodyFont,
                    fontSize: 11,
                    fontWeight: 500,
                    color: THEME.night.accent,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 12,
                  }}>BY NIGHT</span>
                  <p style={{
                    fontFamily: displayFont,
                    fontSize: 20,
                    fontStyle: 'italic',
                    lineHeight: 1.8,
                    color: THEME.night.text,
                    maxWidth: 520,
                    margin: 0,
                  }}>{nightStory}</p>
                </div>

                {personalizedStory && (
                <div style={{
                  marginBottom: 0,
                  animation: 'fadeInUp 500ms ease 1600ms forwards',
                  opacity: 0,
                }}>
                  <span style={{
                    fontFamily: bodyFont,
                    fontSize: 11,
                    fontWeight: 500,
                    color: THEME.night.accent,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 12,
                  }}>YOUR STORY</span>
                  <p style={{
                    fontFamily: displayFont,
                    fontSize: 20,
                    fontStyle: 'italic',
                    lineHeight: 1.8,
                    color: THEME.night.text,
                    maxWidth: 520,
                    margin: 0,
                  }}>{personalizedStory}</p>
                </div>
                )}

                {!isDemo && (
                  <p style={{
                    fontFamily: bodyFont,
                    fontSize: 14,
                    color: THEME.night.muted,
                    letterSpacing: '0.05em',
                    textAlign: 'center',
                    marginTop: 48,
                    animation: 'fadeInUp 500ms ease 1900ms forwards',
                    opacity: 0,
                  }}>
                    Your application is in. We read every one. We&apos;ll be in touch. &#x1F5A4;
                  </p>
                )}

                {submitResult.memberQrCode && <QrReveal code={submitResult.memberQrCode} />}
              </div>

              {/* Right Column — 42%, sticky on desktop */}
              <div style={{
                flex: '1 1 42%',
                minWidth: 300,
                padding: 'clamp(60px, 8vw, 100px) clamp(24px, 5vw, 40px)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                background: 'var(--bg-reveal-surface)',
                position: 'sticky',
                top: 0,
                alignSelf: 'flex-start',
                minHeight: '100vh',
              }}>
                {/* Spectrum bars */}
                <div style={{
                  marginBottom: 40,
                  animation: 'fadeInUp 500ms ease 2000ms forwards',
                  opacity: 0,
                }}>
                  <span style={{
                    fontFamily: bodyFont,
                    fontSize: 11,
                    fontWeight: 500,
                    color: THEME.night.muted,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 20,
                  }}>YOUR SPECTRUM</span>
                  {ARCHETYPE_ORDER.map((name, i) => {
                    const score = submitResult.archetypeScores[name] ?? 0;
                    const isTop = submitResult.archetype === name;
                    return (
                      <div key={name} style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontFamily: bodyFont, color: isTop ? THEME.night.accent : THEME.night.text, fontWeight: isTop ? 600 : 400 }}>{name}</span>
                          <span style={{ fontSize: 12, fontFamily: bodyFont, color: THEME.night.muted }}>{score}</span>
                        </div>
                        <div style={{ height: 4, background: THEME.night.border, borderRadius: 0, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${score}%`,
                            background: isTop ? THEME.night.accent : THEME.night.muted,
                            borderRadius: 0,
                            animation: `barGrow 800ms ease ${2000 + i * 150}ms forwards`,
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Tags */}
                {submitResult.tags && submitResult.tags.length > 0 && (
                  <div style={{
                    marginBottom: 48,
                    animation: 'fadeInUp 500ms ease 2600ms forwards',
                    opacity: 0,
                  }}>
                    <span style={{
                      fontFamily: bodyFont,
                      fontSize: 11,
                      fontWeight: 500,
                      color: THEME.night.muted,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      display: 'block',
                      marginBottom: 16,
                    }}>YOUR TAGS</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {submitResult.tags.map(tag => (
                        <span key={tag} style={{
                          fontFamily: bodyFont,
                          fontSize: 11,
                          color: THEME.night.text,
                          background: 'var(--bg-reveal-surface)',
                          border: `1px solid ${THEME.night.border}`,
                          borderRadius: 0,
                          padding: '8px 16px',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Share section */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  marginBottom: 48,
                  animation: 'fadeInUp 500ms ease 3000ms forwards',
                  opacity: 0,
                }}>
                  <button style={{
                    background: 'transparent',
                    color: THEME.night.accent,
                    border: `1px solid ${THEME.night.accent}`,
                    borderRadius: 0,
                    padding: '0 24px',
                    height: 48,
                    fontSize: 12,
                    fontFamily: bodyFont,
                    fontWeight: 500,
                    cursor: 'pointer',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    width: '100%',
                  }} onClick={generateShareCard}>
                    share your archetype
                  </button>
                  <button style={{
                    background: 'transparent',
                    color: THEME.night.accent,
                    border: `1px solid ${THEME.night.accent}`,
                    borderRadius: 0,
                    padding: '0 24px',
                    height: 48,
                    fontSize: 12,
                    fontFamily: bodyFont,
                    fontWeight: 500,
                    cursor: 'pointer',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    width: '100%',
                  }} onClick={() => { navigator.clipboard.writeText(window.location.href).catch(() => {}); }}>
                    copy link
                  </button>
                </div>

                {/* Frogger trigger */}
                <div style={{
                  textAlign: 'center',
                  animation: 'fadeInUp 500ms ease 3000ms forwards',
                  opacity: 0,
                }}>
                  <button onClick={() => setShowFrogger(true)} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: bodyFont,
                    fontSize: 12,
                    color: THEME.night.muted,
                    letterSpacing: '0.04em',
                  }}>
                    still with us?
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === REVEAL_STEP && submitResult && Object.keys(submitResult.archetypeScores ?? {}).length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 80, minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <h1 style={{ fontFamily: bodyFont, fontSize: 28, fontWeight: 500, color: theme.text, marginBottom: 16 }}>
              Your answers are in.
            </h1>
            <p style={{ fontFamily: bodyFont, fontSize: 16, color: theme.muted }}>
              We&apos;ll be in touch.
            </p>
          </div>
        )}

        {step === REVEAL_STEP && !submitResult && (
          <div style={{ textAlign: 'center', paddingTop: 80, minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <p style={{ fontFamily: bodyFont, fontSize: 16, color: theme.muted }}>Reading your application...</p>
          </div>
        )}

      </main>

      {showFrogger && <FroggerGame onClose={() => setShowFrogger(false)} />}

      {isDev && (
        <>
          <button
            className="hidden sm:block"
            onClick={fillSample}
            onMouseEnter={() => setDevHovered(true)}
            onMouseLeave={() => setDevHovered(false)}
            style={{
              position: 'fixed', bottom: 16, left: 16, zIndex: 100,
              background: theme.text,
              color: theme.bg,
              border: 'none', borderRadius: 0, padding: '6px 12px',
              fontSize: 10, fontFamily: bodyFont, letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer', opacity: devHovered ? 0.6 : 0.15,
              transition: 'opacity 200ms ease',
            }}
          >
            fill test data
          </button>
          {testDataLoaded && (
            <div
              className="hidden sm:block"
              style={{
              position: 'fixed', bottom: 50, left: 16, zIndex: 100,
              background: theme.accent, color: '#ffffff',
              borderRadius: 0, padding: '4px 10px',
              fontSize: 10, fontFamily: bodyFont, pointerEvents: 'none',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              test data loaded
            </div>
          )}
        </>
      )}

      </div>
    </>
  );
}
