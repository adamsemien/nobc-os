'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ARCHETYPES, ARCHETYPE_ORDER, ArchetypeName } from '@/config/archetypes';
import dynamic from 'next/dynamic';
import { Mic } from 'lucide-react';
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
  consentSms: boolean;
}

interface SubmitResult {
  archetype: string;
  archetypeScores: Record<string, number>;
  tags: string[];
  personalizedCopy: string;
}

const EMPTY_FORM: FormData = {
  fullName: '', email: '', phone: '',
  foodAccessibility: '',
  photoUrls: [], agreedToTerms: false, consentSms: false,
};

// ---------------------------------------------------------------------------
// Chapter pagination - the questions module is the single source of truth for
// CONTENT; this map is the single source of truth for LAYOUT. The 39 questions
// are grouped into 6 chapter-pages. Nothing is cut, renamed, or duplicated -
// every id below resolves to a question in the module. Each page belongs to
// exactly one section, so the three section interstitials still fire only at
// the section boundaries (pages 1, 3, and 6).
// ---------------------------------------------------------------------------

const CHAPTER_PAGE_IDS: string[][] = [
  // Section 01 - Who You Are (pages follow module order; personality-test
  // questions kept together on Page 2)
  ['firstName', 'lastName', 'email', 'cell', 'homeAddress', 'cities', 'birthInfo', 'gender', 'dietary', 'links'],
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
const QUESTION_STEPS = PAGES.length;
const LEGAL_STEP = QUESTION_STEPS;
const REVEAL_STEP = QUESTION_STEPS + 1;

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
    } else {
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
  if (id === 'email') return 'jordan.voss@test.com';
  if (id === 'cell') return '512-555-0192';
  if (id === 'birthDate') return '1990-04-12';
  switch (type) {
    case 'email': return 'jordan.voss@test.com';
    case 'tel': return '512-555-0192';
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
 */
function SectionIntro({
  eyebrow,
  title,
  onDone,
}: {
  eyebrow: string;
  title: string;
  onDone: () => void;
}) {
  return (
    <div
      onClick={onDone}
      className="apply-interstitial fixed inset-0 z-[70] flex cursor-pointer flex-col items-center justify-center bg-bg px-6 text-center"
      style={{
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
    </div>
  );
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
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [testDataLoaded, setTestDataLoaded] = useState(false);
  const [devHovered, setDevHovered] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [bannerFading, setBannerFading] = useState(false);
  const [interstitial, setInterstitial] = useState<{ eyebrow: string; title: string } | null>(null);
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
    if (!id || isDemo || isDev) return;
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

  useEffect(() => {
    return () => { photoPreviewUrls.forEach(u => URL.revokeObjectURL(u)); };
  }, [photoPreviewUrls]);

  // Section interstitial: the first time a section's first page is reached,
  // show a full-screen card before the form. CSS handles the motion; we just
  // auto-dismiss after it settles (and a tap/click dismisses early).
  useEffect(() => {
    if (step >= LEGAL_STEP) return;
    const page = PAGES[step];
    const sectionId = page[0].section;
    const isFirstPageOfSection = step === 0 || PAGES[step - 1][0].section !== sectionId;
    if (!isFirstPageOfSection || seenSections.current.has(sectionId)) return;
    seenSections.current.add(sectionId);
    const section = SECTION_BY_ID[sectionId];
    setInterstitial({ eyebrow: section.eyebrow, title: section.title });
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
      if (!id) {
        const res = await fetch('/api/apply/membership', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: data.fullName, email: data.email, phone: data.phone, answers }),
        });
        if (res.ok) {
          const result = await res.json();
          id = result.id as string;
          setApplicationId(id);
          const newUrl = isDemo ? `?id=${id}&demo=true` : isDev ? `?id=${id}&dev=true` : `?id=${id}`;
          window.history.replaceState(null, '', newUrl);
        }
      } else {
        await fetch(`/api/apply/membership/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        });
      }
    } catch { /* silent */ }
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
          consentEmail: true, consentSms: data.consentSms,
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
  const personalizedStory = submitResult?.personalizedCopy || dayStory;

  // ----- Generic question rendering -----

  function renderSimpleInput(q: Question, key: string, showHint = false) {
    const value = answers[key] ?? '';
    if (q.type === 'textarea') {
      const recording = recordingKey === key;
      return (
        <div style={{ position: 'relative' }}>
          <textarea
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
                {sub.label && <label style={{ ...labelStyle, fontSize: 12, fontWeight: 500, color: theme.muted }}>{sub.label}</label>}
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
        <label style={labelStyle}>{q.label}</label>
        {q.help && <p style={helpStyle}>{q.help}</p>}
        {renderSimpleInput(q, key, hintKey === key)}
      </div>
    );
  }

  /** Validate a page's required fields and gather the answers it owns. */
  function pageIsComplete(page: Question[]): boolean {
    for (const q of page) {
      if (q.type === 'group') {
        for (const sub of q.fields ?? []) {
          if (sub.required && !(answers[answerKey(q, sub)] ?? '').trim()) return false;
        }
      } else if (q.required) {
        const v = (answers[answerKey(q)] ?? '').trim();
        // allowNone questions accept "none"; required still means non-empty.
        if (!v) return false;
      }
    }
    return true;
  }

  function answersForPage(page: Question[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of keysForPage(page)) {
      out[key] = answers[key] ?? '';
    }
    return out;
  }

  function submitPage(pageIndex: number) {
    const page = PAGES[pageIndex];
    if (!isDemo && !pageIsComplete(page)) {
      setError('Please answer the required questions on this page.');
      return;
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
          .apply-page-enter {
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
      `}</style>
      <div className="apply-form" style={{ background: theme.bg, minHeight: '100vh', fontFamily: bodyFont, color: theme.text, transition: 'background 300ms ease, color 300ms ease' }}>

      {/* Section interstitial */}
      {interstitial && step < REVEAL_STEP && (
        <SectionIntro
          eyebrow={interstitial.eyebrow}
          title={interstitial.title}
          onDone={() => setInterstitial(null)}
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
          const isFirstSection = section.id === SECTIONS[0].id;
          // The one-time mic hint attaches to the first textarea on this page.
          const firstTextarea = page.find(q => q.type === 'textarea');
          const hintKey = speechSupported && !micHintSeen && firstTextarea ? firstTextarea.id : null;
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

              {isFirstPageOfSection && isFirstSection && (
                <div style={{ marginBottom: 56 }}>
                  <p style={{ fontFamily: displayFont, fontSize: 20, fontStyle: 'italic', lineHeight: 1.6, color: theme.text, margin: '0 0 24px 0' }}>{INTRO.lead}</p>
                  {INTRO.body.map((para, i) => (
                    <p key={i} style={{ fontFamily: bodyFont, fontSize: 15, lineHeight: 1.75, color: theme.muted, margin: '0 0 18px 0' }}>{para}</p>
                  ))}
                  <p style={{ fontFamily: bodyFont, fontSize: 15, fontWeight: 600, lineHeight: 1.6, color: theme.text, margin: 0 }}>{INTRO.bold}</p>
                </div>
              )}

              {page.map((q) => renderQuestion(q, hintKey))}

              {error && <p style={{ color: theme.accent, fontFamily: bodyFont, fontSize: 13, marginBottom: 16 }}>{error}</p>}
              {navBlock(() => submitPage(step))}
            </div>
          );
        })()}

        {/* SCREEN 7: Legal */}
        {step === LEGAL_STEP && (
          <div style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
            <span style={chapterLabelStyle}>THE FINE PRINT</span>
            <h1 style={sectionHeadingStyle}>Almost There</h1>

            <div style={{ maxHeight: 'clamp(200px, 40vw, 400px)', minHeight: 120, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', borderBottom: `1px solid ${theme.border}`, padding: '20px 0', marginBottom: 32 }}>
              <div style={{ fontFamily: bodyFont, fontSize: 13, lineHeight: 1.7, color: theme.text, whiteSpace: 'pre-line' }}>
                <strong style={{ display: 'block', marginBottom: 16, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>MEMBERSHIP APPLICATION - TERMS AND CONDITIONS</strong>

                <strong>1. MEMBERSHIP DISCRETION</strong>{'\n'}
                No Bad Company (&quot;NoBC&quot;, &quot;we&quot;, &quot;us&quot;) reserves the sole and absolute right to accept or decline any membership application for any reason or no reason. Submission of this application does not create any obligation on NoBC to grant membership. Membership decisions are final and not subject to appeal.{'\n\n'}

                <strong>2. AGE REQUIREMENT</strong>{'\n'}
                You must be 18 years of age or older to apply for membership. By submitting this application, you represent and warrant that you are at least 18 years old.{'\n\n'}

                <strong>3. COMMUNICATIONS CONSENT</strong>{'\n'}
                By submitting this application, you consent to receive communications from NoBC via email. You are automatically enrolled in No Bad News, our member communications program, which includes event announcements, community updates, and curated content. You may opt out of email communications at any time by contacting team@thenobadcompany.com. SMS/text message communications are optional and require separate affirmative consent below.{'\n\n'}

                <strong>4. PHOTO, VIDEO, AND CONTENT RELEASE</strong>{'\n'}
                By submitting this application and participating in NoBC events and activities, you grant NoBC an irrevocable, royalty-free, worldwide license to use, reproduce, distribute, and display photographs, video recordings, and other content that may capture your likeness, image, or voice in connection with NoBC events, marketing materials, social media, and other promotional purposes. This license survives termination of membership.{'\n\n'}

                <strong>5. DATA AND PRIVACY</strong>{'\n'}
                NoBC collects and stores the personal information you provide in this application for membership administration purposes. We do not sell your personal data to third parties. We retain your information for 24 months following the date of your application or the termination of your membership, whichever is later. You may request deletion of your data by contacting team@thenobadcompany.com. Certain information may be retained as required by applicable law.{'\n\n'}

                <strong>6. LIMITATION OF LIABILITY</strong>{'\n'}
                To the maximum extent permitted by applicable law, NoBC and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or relating to your membership application, membership, or participation in NoBC events or activities.{'\n\n'}

                <strong>7. GOVERNING LAW AND VENUE</strong>{'\n'}
                This agreement shall be governed by and construed in accordance with the laws of the State of Texas. Any dispute arising under this agreement shall be resolved exclusively in the courts of Travis County, Texas.
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontFamily: bodyFont, fontSize: 13, color: theme.text, lineHeight: 1.5 }}>
                <input type="checkbox" checked={data.consentSms} onChange={e => set('consentSms', e.target.checked)} style={{ marginTop: 2, accentColor: theme.accent }} />
                I&apos;d like to receive event reminders and updates via text message (optional)
              </label>
            </div>
            <div style={{ marginBottom: 40 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontFamily: bodyFont, fontSize: 13, color: theme.text, lineHeight: 1.5 }}>
                <input type="checkbox" checked={data.agreedToTerms} onChange={e => set('agreedToTerms', e.target.checked)} style={{ marginTop: 2, accentColor: theme.accent }} />
                I have read and agree to the terms above
              </label>
            </div>

            {error && <p style={{ color: theme.accent, fontFamily: bodyFont, fontSize: 13, marginBottom: 16 }}>{error}</p>}
            {navBlock(handleSubmit, 'submit my application', !data.agreedToTerms)}
          </div>
        )}

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
