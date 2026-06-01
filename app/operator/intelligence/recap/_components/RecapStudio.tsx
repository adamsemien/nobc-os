'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSponsorBrand, saveSponsorBrief } from '../actions';

export interface SponsorDTO {
  id: string;
  name: string;
  declaredObjectives: string;
  rightsFeeDollars: number | null;
  persona: {
    archetypes: string;
    seniority: string;
    industries: string;
    companySizes: string;
    minAttendance: number | null;
  };
}

const LABEL = 'mb-1.5 block text-[10px] uppercase';
const labelStyle = { letterSpacing: '0.22em', color: 'var(--text-secondary)' } as const;
const fieldClass = 'w-full rounded-[3px] border bg-transparent px-3 py-2 text-[14px] outline-none';
const fieldStyle = { borderColor: 'var(--border)', color: 'var(--text-primary)' } as const;

function num(v: string): number | null {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) ? n : null;
}

export function RecapStudio({ sponsors, events }: { sponsors: SponsorDTO[]; events: { id: string; label: string }[] }) {
  const router = useRouter();
  const [sponsorId, setSponsorId] = useState(sponsors[0]?.id ?? '');
  const selected = sponsors.find((s) => s.id === sponsorId) ?? null;

  // Brief form, synced when the selected sponsor changes.
  const [objectives, setObjectives] = useState('');
  const [rightsFee, setRightsFee] = useState('');
  const [archetypes, setArchetypes] = useState('');
  const [seniority, setSeniority] = useState('');
  const [industries, setIndustries] = useState('');
  const [companySizes, setCompanySizes] = useState('');
  const [minAttendance, setMinAttendance] = useState('');

  useEffect(() => {
    if (!selected) return;
    setObjectives(selected.declaredObjectives);
    setRightsFee(selected.rightsFeeDollars != null ? String(selected.rightsFeeDollars) : '');
    setArchetypes(selected.persona.archetypes);
    setSeniority(selected.persona.seniority);
    setIndustries(selected.persona.industries);
    setCompanySizes(selected.persona.companySizes);
    setMinAttendance(selected.persona.minAttendance != null ? String(selected.persona.minAttendance) : '');
  }, [selected]);

  const [savingBrief, setSavingBrief] = useState(false);
  const [briefMsg, setBriefMsg] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  // Generate
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [owned, setOwned] = useState('');
  const [earned, setEarned] = useState('');
  const [password, setPassword] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendingSurvey, setSendingSurvey] = useState<'PRE' | 'POST' | null>(null);
  const [surveyMsg, setSurveyMsg] = useState<string | null>(null);

  async function onSaveBrief() {
    if (!sponsorId || savingBrief) return;
    setSavingBrief(true);
    setBriefMsg(null);
    try {
      await saveSponsorBrief({
        sponsorBrandId: sponsorId,
        declaredObjectives: objectives,
        rightsFeeDollars: num(rightsFee),
        persona: { archetypes, seniority, industries, companySizes, minAttendance: num(minAttendance) },
      });
      setBriefMsg('Saved.');
      router.refresh();
    } catch {
      setBriefMsg('Could not save — check your access and try again.');
    } finally {
      setSavingBrief(false);
    }
  }

  async function onCreateSponsor() {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await createSponsorBrand(name);
      setNewName('');
      router.refresh();
      setSponsorId(res.id);
    } catch {
      setBriefMsg('Could not create sponsor.');
    }
  }

  async function onGenerate() {
    if (!sponsorId || !eventId || generating) return;
    setGenerating(true);
    setGenError(null);
    setResultUrl(null);
    try {
      const res = await fetch('/api/intelligence/activation-recap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          sponsorBrandId: sponsorId,
          ownedImpressions: num(owned) ?? 0,
          earnedImpressions: num(earned) ?? 0,
          password: password.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string; storageConfigured?: boolean };
      if (!res.ok || !data.ok || !data.url) {
        setGenError(data.error ?? 'Generation failed.');
      } else {
        setResultUrl(data.url);
        if (data.storageConfigured === false) {
          setGenError('Note: object storage is not configured in this environment, so the PDF was not stored — the link will work once R2 is set.');
        }
      }
    } catch {
      setGenError('Generation failed — please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function onSendSurvey(phase: 'PRE' | 'POST') {
    if (!sponsorId || !eventId || sendingSurvey) return;
    setSendingSurvey(phase);
    setSurveyMsg(null);
    try {
      const res = await fetch('/api/intelligence/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, sponsorBrandId: sponsorId, phase }),
      });
      const data = (await res.json()) as { ok?: boolean; invited?: number; sent?: number; skipped?: number; error?: string };
      if (!res.ok || !data.ok) setSurveyMsg(data.error ?? 'Could not send the survey.');
      else setSurveyMsg(`${phase} survey — ${data.invited} invited, ${data.sent} emailed, ${data.skipped} skipped.`);
    } catch {
      setSurveyMsg('Could not send — please try again.');
    } finally {
      setSendingSurvey(null);
    }
  }

  async function copyLink() {
    if (!resultUrl) return;
    try {
      await navigator.clipboard.writeText(resultUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — the link is shown for manual copy */
    }
  }

  if (sponsors.length === 0) {
    return (
      <div className="py-12">
        <p className="text-[15px]" style={{ color: 'var(--text-secondary)' }}>
          No sponsor brands yet. Create one to start a Brief.
        </p>
        <div className="mt-4 flex max-w-md gap-2">
          <input
            className={fieldClass}
            style={fieldStyle}
            placeholder="Sponsor name (e.g. Aesop)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="button" onClick={onCreateSponsor} className="shrink-0 rounded-[3px] px-5 text-[12px] uppercase" style={{ letterSpacing: '0.16em', background: 'var(--accent)', color: 'var(--on-primary)' }}>
            Add
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-16 gap-y-12 py-12 lg:grid-cols-2">
      {/* ── Sponsor Brief intake ─────────────────────────────── */}
      <section>
        <p className="text-[12px] uppercase" style={{ letterSpacing: '0.26em', color: 'var(--text-secondary)' }}>
          Sponsor Brief
        </p>

        <div className="mt-5">
          <label className={LABEL} style={labelStyle}>Sponsor</label>
          <div className="flex gap-2">
            <select className={fieldClass} style={fieldStyle} value={sponsorId} onChange={(e) => setSponsorId(e.target.value)}>
              {sponsors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5">
          <label className={LABEL} style={labelStyle}>Declared objectives (their words)</label>
          <textarea
            className={fieldClass}
            style={{ ...fieldStyle, minHeight: 90, resize: 'vertical' }}
            placeholder="e.g. Brand affinity and awareness, with strong activation — the right founders in the room."
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
          />
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            Mentioning Awareness / Affinity / Acquisition / Activation marks them as stated goals on page one.
          </p>
        </div>

        <div className="mt-5">
          <label className={LABEL} style={labelStyle}>Rights fee (USD)</label>
          <input className={fieldClass} style={fieldStyle} inputMode="numeric" placeholder="50000" value={rightsFee} onChange={(e) => setRightsFee(e.target.value)} />
        </div>

        <p className="mt-7 text-[11px] uppercase" style={{ letterSpacing: '0.2em', color: 'var(--text-tertiary)' }}>
          Target persona — comma-separated, all optional
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL} style={labelStyle}>Archetypes / tiers</label>
            <input className={fieldClass} style={fieldStyle} placeholder="Founder, Operator" value={archetypes} onChange={(e) => setArchetypes(e.target.value)} />
          </div>
          <div>
            <label className={LABEL} style={labelStyle}>Seniority</label>
            <input className={fieldClass} style={fieldStyle} placeholder="Founder/CEO, C-Suite" value={seniority} onChange={(e) => setSeniority(e.target.value)} />
          </div>
          <div>
            <label className={LABEL} style={labelStyle}>Industries</label>
            <input className={fieldClass} style={fieldStyle} placeholder="Technology, Venture Capital" value={industries} onChange={(e) => setIndustries(e.target.value)} />
          </div>
          <div>
            <label className={LABEL} style={labelStyle}>Company sizes</label>
            <input className={fieldClass} style={fieldStyle} placeholder="11-50, 51-200" value={companySizes} onChange={(e) => setCompanySizes(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 max-w-[180px]">
          <label className={LABEL} style={labelStyle}>Min attendance target</label>
          <input className={fieldClass} style={fieldStyle} inputMode="numeric" placeholder="200" value={minAttendance} onChange={(e) => setMinAttendance(e.target.value)} />
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button type="button" onClick={onSaveBrief} disabled={savingBrief} className="rounded-[3px] px-6 py-2.5 text-[11px] uppercase disabled:opacity-50" style={{ letterSpacing: '0.18em', background: 'var(--accent)', color: 'var(--on-primary)' }}>
            {savingBrief ? 'Saving…' : 'Save Brief'}
          </button>
          {briefMsg && <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>{briefMsg}</span>}
        </div>

        <div className="mt-8 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
          <label className={LABEL} style={labelStyle}>Add a sponsor</label>
          <div className="flex max-w-sm gap-2">
            <input className={fieldClass} style={fieldStyle} placeholder="Sponsor name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button type="button" onClick={onCreateSponsor} className="shrink-0 rounded-[3px] border px-4 text-[12px] uppercase" style={{ letterSpacing: '0.16em', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              Add
            </button>
          </div>
        </div>
      </section>

      {/* ── Generate Activation Recap ────────────────────────── */}
      <section>
        <p className="text-[12px] uppercase" style={{ letterSpacing: '0.26em', color: 'var(--text-secondary)' }}>
          Generate Activation Recap
        </p>

        <div className="mt-5">
          <label className={LABEL} style={labelStyle}>Completed event</label>
          <select className={fieldClass} style={fieldStyle} value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {events.length === 0 && <option value="">No events found</option>}
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL} style={labelStyle}>Owned impressions</label>
            <input className={fieldClass} style={fieldStyle} inputMode="numeric" placeholder="120000" value={owned} onChange={(e) => setOwned(e.target.value)} />
          </div>
          <div>
            <label className={LABEL} style={labelStyle}>Earned impressions</label>
            <input className={fieldClass} style={fieldStyle} inputMode="numeric" placeholder="380000" value={earned} onChange={(e) => setEarned(e.target.value)} />
          </div>
        </div>

        <div className="mt-5">
          <label className={LABEL} style={labelStyle}>Link password (optional)</label>
          <input className={fieldClass} style={fieldStyle} placeholder="Leave blank for an unguessable link only" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <button type="button" onClick={onGenerate} disabled={generating || !eventId} className="mt-6 rounded-[3px] px-7 py-3 text-[11px] uppercase disabled:opacity-50" style={{ letterSpacing: '0.2em', background: 'var(--primary)', color: 'var(--on-primary)' }}>
          {generating ? 'Generating…' : 'Generate Activation Recap'}
        </button>
        <p className="mt-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          Computes the numbers, renders the PDF, and mints a magic link. Usually under a minute.
        </p>

        {genError && (
          <p className="mt-5 text-[13px]" style={{ color: 'var(--text-secondary)' }}>{genError}</p>
        )}

        {resultUrl && (
          <div className="mt-6 rounded-[4px] border p-4" style={{ borderColor: 'var(--border)', background: 'var(--raised)' }}>
            <p className="text-[11px] uppercase" style={{ letterSpacing: '0.2em', color: 'var(--text-secondary)' }}>Magic link</p>
            <p className="mt-2 break-all text-[13px]" style={{ color: 'var(--text-primary)' }}>{resultUrl}</p>
            <div className="mt-3 flex gap-3">
              <button type="button" onClick={copyLink} className="rounded-[3px] px-4 py-2 text-[11px] uppercase" style={{ letterSpacing: '0.16em', background: 'var(--accent)', color: 'var(--on-primary)' }}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="rounded-[3px] border px-4 py-2 text-[11px] uppercase" style={{ letterSpacing: '0.16em', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                Open
              </a>
            </div>
          </div>
        )}

        <div className="mt-8 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[11px] uppercase" style={{ letterSpacing: '0.2em', color: 'var(--text-secondary)' }}>
            Brand-lift survey
          </p>
          <p className="mt-2 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            Email the audience a pre- or post-event survey from team@thenobadcompany.com. The recap&rsquo;s
            Affinity section fills in automatically as responses arrive.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onSendSurvey('PRE')} disabled={sendingSurvey !== null || !eventId} className="rounded-[3px] border px-4 py-2 text-[11px] uppercase disabled:opacity-50" style={{ letterSpacing: '0.14em', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              {sendingSurvey === 'PRE' ? 'Sending…' : 'Send pre-survey'}
            </button>
            <button type="button" onClick={() => onSendSurvey('POST')} disabled={sendingSurvey !== null || !eventId} className="rounded-[3px] border px-4 py-2 text-[11px] uppercase disabled:opacity-50" style={{ letterSpacing: '0.14em', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              {sendingSurvey === 'POST' ? 'Sending…' : 'Send post-survey'}
            </button>
          </div>
          {surveyMsg && <p className="mt-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{surveyMsg}</p>}
        </div>
      </section>
    </div>
  );
}
