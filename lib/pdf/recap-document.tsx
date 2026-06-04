/**
 * Activation Recap — the sponsor-facing editorial PDF (@react-pdf/renderer).
 *
 * Organized by the sponsor's four objectives with Audience Quality as the foundation and the
 * renewal recommendation as the close. Page 1 stands alone when forwarded up the chain: it
 * answers "was it worth it?" in five seconds (objectives checklist + equivalent-media-value
 * headline + five hero stats). Internal metric-tier labels never appear; every number carries
 * a plain-English meaning + benchmark. Colors come only from lib/pdf/palette (the documented
 * hex exception); type is the brand serif/sans registered in lib/pdf/fonts.
 */
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { INFLUENCE_TIER_META } from '@/lib/intelligence/influence-tiers';
import { fmtInt, fmtMultiple, fmtPct, fmtUsdCompact, fmtUsdCents } from '@/lib/intelligence/recap-format';
import type {
  DeliverableProof,
  HeroStat,
  InfluenceTierShare,
  MediaValueTier,
  ObjectiveResult,
  RecapPayload,
  TierScanStats,
} from '@/lib/intelligence/recap-types';
import { PDF, TIER_COLORS } from './palette';
import { SANS, SERIF } from './fonts';

const s = StyleSheet.create({
  page: {
    backgroundColor: PDF.paper,
    color: PDF.ink,
    fontFamily: SANS,
    fontSize: 9.5,
    lineHeight: 1.5,
    paddingTop: 54,
    paddingBottom: 56,
    paddingHorizontal: 54,
  },
  kicker: { fontFamily: SANS, fontSize: 8, fontWeight: 700, letterSpacing: 2, color: PDF.accent, textTransform: 'uppercase' },
  wordmark: { fontFamily: SANS, fontSize: 7.5, fontWeight: 500, letterSpacing: 2.5, color: PDF.faint, textTransform: 'uppercase' },
  hairline: { borderBottomWidth: 0.75, borderBottomColor: PDF.rule, marginVertical: 14 },
  hairlineTight: { borderBottomWidth: 0.5, borderBottomColor: PDF.rule, marginVertical: 8 },

  displayTitle: { fontFamily: SERIF, fontSize: 34, fontWeight: 700, lineHeight: 1.05, marginTop: 6 },
  displaySub: { fontFamily: SERIF, fontSize: 15, fontWeight: 400, fontStyle: 'italic', color: PDF.accent, marginTop: 8 },
  standfirst: { fontFamily: SERIF, fontSize: 12, fontStyle: 'italic', color: PDF.muted, lineHeight: 1.45, marginTop: 14, maxWidth: 440 },

  sectionTitle: { fontFamily: SERIF, fontSize: 21, fontWeight: 700, marginBottom: 2 },
  sectionLede: { fontFamily: SANS, fontSize: 9, color: PDF.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 },

  body: { fontFamily: SANS, fontSize: 9.5, color: PDF.muted, lineHeight: 1.55 },
  bodyInk: { fontFamily: SANS, fontSize: 9.5, color: PDF.ink, lineHeight: 1.55 },
  pullquote: { fontFamily: SERIF, fontSize: 13, fontStyle: 'italic', color: PDF.ink, lineHeight: 1.45 },

  // objectives checklist
  objRow: { flexDirection: 'row', marginBottom: 12 },
  objDot: { width: 9, height: 9, borderRadius: 4.5, marginTop: 3, marginRight: 10 },
  objName: { fontFamily: SANS, fontSize: 11, fontWeight: 700, color: PDF.ink },
  objStatus: { fontFamily: SANS, fontSize: 7.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' },
  objHead: { fontFamily: SANS, fontSize: 9, color: PDF.muted, marginTop: 2, lineHeight: 1.45 },

  // value band
  valueBand: { backgroundColor: PDF.ink, borderRadius: 4, paddingVertical: 18, paddingHorizontal: 22, marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  valueBig: { fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: PDF.onRed, lineHeight: 1 },
  valueCaption: { fontFamily: SANS, fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase', color: PDF.onInkMuted, marginTop: 6 },
  valueMult: { fontFamily: SERIF, fontSize: 18, fontStyle: 'italic', color: PDF.onRed, textAlign: 'right', lineHeight: 1 },
  valueMultCap: { fontFamily: SANS, fontSize: 7.5, letterSpacing: 1, textTransform: 'uppercase', color: PDF.onInkMuted, textAlign: 'right', marginTop: 2 },

  // hero stats
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, marginHorizontal: -6 },
  heroCell: { width: '20%', paddingHorizontal: 6 },
  heroValue: { fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: PDF.ink },
  heroLabel: { fontFamily: SANS, fontSize: 7.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: PDF.accent, marginTop: 3 },
  heroMeans: { fontFamily: SANS, fontSize: 7.5, color: PDF.muted, marginTop: 3, lineHeight: 1.4 },
  heroBench: { fontFamily: SANS, fontSize: 7, fontStyle: 'italic', color: PDF.faint, marginTop: 2, lineHeight: 1.35 },

  // bars
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  barLabel: { width: 150, fontFamily: SANS, fontSize: 9, color: PDF.ink },
  barTrack: { flex: 1, height: 9, backgroundColor: PDF.cream, borderRadius: 2, marginHorizontal: 8, borderWidth: 0.5, borderColor: PDF.rule },
  barFill: { height: 9, borderRadius: 2 },
  barVal: { width: 78, fontFamily: SANS, fontSize: 8.5, color: PDF.muted, textAlign: 'right' },

  // tables
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: PDF.rule, paddingVertical: 6 },
  tHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: PDF.ink, paddingBottom: 5 },
  th: { fontFamily: SANS, fontSize: 7.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: PDF.faint },
  td: { fontFamily: SANS, fontSize: 9.5, color: PDF.ink },
  tdMuted: { fontFamily: SANS, fontSize: 9, color: PDF.muted },
  rowHi: { backgroundColor: PDF.cream },

  footnote: { fontFamily: SANS, fontSize: 7, color: PDF.faint, lineHeight: 1.4, marginTop: 4 },

  // chips
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, marginTop: 4 },
  chip: { borderWidth: 0.5, borderColor: PDF.rule, borderRadius: 3, backgroundColor: PDF.card, paddingVertical: 4, paddingHorizontal: 8, margin: 3 },
  chipLabel: { fontFamily: SANS, fontSize: 8.5, color: PDF.ink },
  chipVal: { fontFamily: SANS, fontSize: 8.5, fontWeight: 700, color: PDF.accent },

  // deliverables
  proofRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginTop: 8 },
  proofCard: { width: '33.33%', paddingHorizontal: 5, marginBottom: 10 },
  proofImg: { width: '100%', height: 96, borderRadius: 3, objectFit: 'cover', borderWidth: 0.5, borderColor: PDF.rule },
  proofPlaceholder: { width: '100%', height: 96, borderRadius: 3, backgroundColor: PDF.cream, borderWidth: 0.5, borderColor: PDF.rule, alignItems: 'center', justifyContent: 'center' },
  proofLabel: { fontFamily: SANS, fontSize: 8, color: PDF.ink, marginTop: 4, fontWeight: 500 },
  proofStatus: { fontFamily: SANS, fontSize: 7, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 1 },

  footer: { position: 'absolute', bottom: 28, left: 54, right: 54, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: PDF.rule, paddingTop: 7 },
  footerText: { fontFamily: SANS, fontSize: 7, color: PDF.faint, letterSpacing: 0.5 },

  twoCol: { flexDirection: 'row', marginHorizontal: -12 },
  col: { flex: 1, paddingHorizontal: 12 },
});

function statusMeta(status: ObjectiveResult['status']): { label: string; color: string } {
  switch (status) {
    case 'met': return { label: 'Delivered', color: PDF.accent };
    case 'on_track': return { label: 'On track', color: PDF.ink };
    case 'partial': return { label: 'Partial', color: PDF.muted };
    case 'pending_module': return { label: 'Available with module', color: PDF.faint };
    default: return { label: 'Not a stated goal', color: PDF.faint };
  }
}

function Footer({ payload, page }: { payload: RecapPayload; page: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>NO BAD COMPANY  ·  PREPARED FOR {payload.sponsor.name.toUpperCase()}</Text>
      <Text style={s.footerText}>{page}  ·  CONFIDENTIAL</Text>
    </View>
  );
}

/* ── Page 1 — Cover + Executive Summary ─────────────────────────────────────── */
function CoverPage({ payload }: { payload: RecapPayload }) {
  const declared = payload.objectives.filter((o) => o.declared);
  const mv = payload.mediaValue;
  return (
    <Page size="LETTER" style={s.page}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={s.kicker}>Activation Recap</Text>
        <Text style={s.wordmark}>No Bad Company</Text>
      </View>
      <Text style={s.displayTitle}>{payload.event.name}</Text>
      <Text style={s.displaySub}>
        {payload.sponsor.name}  ·  {payload.event.dateLabel}
        {payload.event.venue ? `  ·  ${payload.event.venue}` : ''}
      </Text>
      <Text style={s.standfirst}>{payload.narrative.coverStandfirst}</Text>

      <View style={s.hairline} />
      <Text style={s.sectionLede}>Your objectives, answered</Text>
      {declared.map((o) => {
        const m = statusMeta(o.status);
        return (
          <View key={o.objective} style={s.objRow} wrap={false}>
            <View style={[s.objDot, { backgroundColor: m.color }]} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={s.objName}>{o.objective}</Text>
                <Text style={[s.objStatus, { color: m.color }]}>{m.label}</Text>
              </View>
              <Text style={s.objHead}>{o.headline}</Text>
            </View>
          </View>
        );
      })}

      <View style={s.valueBand}>
        <View>
          <Text style={s.valueBig}>{fmtUsdCompact(mv.headline.totalCents)}</Text>
          <Text style={s.valueCaption}>Equivalent media value · {mv.headline.label.toLowerCase()} estimate</Text>
        </View>
        {mv.valueVsFeeMultiple != null && (
          <View>
            <Text style={s.valueMult}>{fmtMultiple(mv.valueVsFeeMultiple)}</Text>
            <Text style={s.valueMultCap}>Media value vs. your rights fee</Text>
          </View>
        )}
      </View>

      <View style={s.heroRow}>
        {payload.heroStats.slice(0, 5).map((h: HeroStat, i: number) => (
          <View key={i} style={s.heroCell} wrap={false}>
            <Text style={s.heroValue}>{h.value}</Text>
            <Text style={s.heroLabel}>{h.label}</Text>
            <Text style={s.heroMeans}>{h.whatThisMeans}</Text>
            <Text style={s.heroBench}>{h.benchmark}</Text>
          </View>
        ))}
      </View>

      <Footer payload={payload} page="Executive summary" />
    </Page>
  );
}

/* ── Page 2 — Who You Reached ───────────────────────────────────────────────── */
function influenceRows(dist: InfluenceTierShare[]): { label: string; pct: number; count: number; color: string }[] {
  const visible = dist.filter((d) => !d.suppressed);
  const suppressed = dist.filter((d) => d.suppressed);
  const rows = visible.map((d) => ({
    label: INFLUENCE_TIER_META[d.tier].label,
    pct: d.pct,
    count: d.count,
    color: TIER_COLORS[d.tier] ?? PDF.muted,
  }));
  const other = suppressed.reduce((acc, d) => acc + d.count, 0);
  const otherPct = suppressed.reduce((acc, d) => acc + d.pct, 0);
  if (other > 0) rows.push({ label: 'Other (fewer than 5 each)', pct: otherPct, count: other, color: PDF.faint });
  return rows;
}

function AudiencePage({ payload }: { payload: RecapPayload }) {
  const a = payload.audience;
  const rows = influenceRows(a.influenceDistribution);
  const demo = (cells: typeof a.senioritySpread) =>
    cells.map((c, i) => (
      <View key={i} style={s.chip} wrap={false}>
        <Text style={s.chipLabel}>
          {c.suppressed ? `${c.label} (combined)` : c.label}{'  '}
          <Text style={s.chipVal}>{fmtInt(c.count)} · {fmtPct(c.pct)}</Text>
        </Text>
      </View>
    ));
  return (
    <Page size="LETTER" style={s.page}>
      <Text style={s.sectionLede}>Audience Quality · the foundation</Text>
      <Text style={s.sectionTitle}>Who you reached</Text>
      <Text style={[s.body, { marginTop: 6, marginBottom: 8 }]}>{payload.narrative.audienceSummary}</Text>

      <View style={s.twoCol}>
        <View style={s.col}>
          <Text style={[s.heroValue, { fontSize: 26 }]}>{a.aggregateInfluenceScore}<Text style={{ fontSize: 13, color: PDF.faint }}> / 100</Text></Text>
          <Text style={s.heroLabel}>Aggregate influence score</Text>
          <Text style={s.heroMeans}>A weighted read of how much the room moves rooms — founders and operators carry the most weight.</Text>
        </View>
        <View style={s.col}>
          {a.personaMatchPct != null && (
            <>
              <Text style={[s.heroValue, { fontSize: 26 }]}>{a.personaMatchSuppressed ? '—' : fmtPct(a.personaMatchPct)}</Text>
              <Text style={s.heroLabel}>Matched your target persona</Text>
              <Text style={s.heroMeans}>
                {a.personaMatchSuppressed
                  ? 'Sample too small to report without risking identification.'
                  : 'Share of the room matching the audience defined in your Sponsor Brief.'}
              </Text>
            </>
          )}
        </View>
      </View>

      <View style={s.hairline} />
      <Text style={s.sectionLede}>Influence tiers in the room</Text>
      {rows.map((r, i) => (
        <View key={i} style={s.barRow} wrap={false}>
          <Text style={s.barLabel}>{r.label}</Text>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${Math.max(2, Math.round(r.pct * 100))}%`, backgroundColor: r.color }]} />
          </View>
          <Text style={s.barVal}>{fmtInt(r.count)} · {fmtPct(r.pct)}</Text>
        </View>
      ))}

      <View style={s.hairlineTight} />
      <View style={s.twoCol}>
        <View style={s.col}>
          <Text style={s.sectionLede}>Seniority</Text>
          <View style={s.chipWrap}>{a.senioritySpread.length ? demo(a.senioritySpread) : <Text style={s.body}>Not on file.</Text>}</View>
        </View>
        <View style={s.col}>
          <Text style={s.sectionLede}>Industry</Text>
          <View style={s.chipWrap}>{a.industrySpread.length ? demo(a.industrySpread) : <Text style={s.body}>Not on file.</Text>}</View>
        </View>
      </View>
      <View style={{ marginTop: 10 }}>
        <Text style={s.sectionLede}>Where they came from</Text>
        <View style={s.chipWrap}>{a.geoSpread.length ? demo(a.geoSpread) : <Text style={s.body}>Not on file.</Text>}</View>
      </View>
      <Text style={s.footnote}>Any group smaller than five attendees is combined into “Other” so no individual can be identified.</Text>

      <Footer payload={payload} page="Who you reached" />
    </Page>
  );
}

/* ── Page 3 — Awareness + Activation ────────────────────────────────────────── */
function emvRow(t: MediaValueTier, headline: boolean) {
  return (
    <View key={t.tier} style={[s.tRow, headline ? s.rowHi : {}]} wrap={false}>
      <Text style={[s.td, { width: '28%', fontWeight: headline ? 700 : 400 }]}>
        {t.label}{headline ? '  (headline)' : ''}
      </Text>
      <Text style={[s.tdMuted, { width: '26%', textAlign: 'right' }]}>{fmtUsdCents(t.audienceValueCents)}</Text>
      <Text style={[s.tdMuted, { width: '24%', textAlign: 'right' }]}>{fmtUsdCents(t.impressionValueCents)}</Text>
      <Text style={[s.td, { width: '22%', textAlign: 'right', fontWeight: 700 }]}>{fmtUsdCents(t.totalCents)}</Text>
    </View>
  );
}

function scanRow(t: TierScanStats) {
  if (t.suppressed) {
    return (
      <View key={t.tier} style={s.tRow} wrap={false}>
        <Text style={[s.td, { width: '40%' }]}>{t.tier} Access</Text>
        <Text style={[s.tdMuted, { width: '60%', fontStyle: 'italic' }]}>Fewer than 5 attended — not broken out</Text>
      </View>
    );
  }
  return (
    <View key={t.tier} style={s.tRow} wrap={false}>
      <Text style={[s.td, { width: '40%' }]}>{t.tier} Access</Text>
      <Text style={[s.tdMuted, { width: '20%', textAlign: 'right' }]}>{fmtInt(t.registered)}</Text>
      <Text style={[s.tdMuted, { width: '20%', textAlign: 'right' }]}>{fmtInt(t.attended)}</Text>
      <Text style={[s.td, { width: '20%', textAlign: 'right', fontWeight: 700 }]}>{fmtPct(t.scanRate)}</Text>
    </View>
  );
}

function AwarenessActivationPage({ payload }: { payload: RecapPayload }) {
  const mv = payload.mediaValue;
  const aw = payload.awareness;
  return (
    <Page size="LETTER" style={s.page}>
      <Text style={s.sectionLede}>Objective · Awareness</Text>
      <Text style={s.sectionTitle}>What the night was worth</Text>
      <Text style={[s.body, { marginTop: 6, marginBottom: 4 }]}>{payload.narrative.awarenessSummary}</Text>
      <Text style={s.bodyInk}>
        In-person reach: <Text style={{ fontWeight: 700 }}>{fmtInt(payload.audience.attended)}</Text> checked-in guests
        {aw.totalReach > 0 ? (
          <Text>{'  ·  '}owned & earned impressions: <Text style={{ fontWeight: 700 }}>{fmtInt(aw.totalReach)}</Text> ({fmtInt(aw.ownedImpressions)} owned + {fmtInt(aw.earnedImpressions)} earned)</Text>
        ) : <Text>{'  ·  '}no owned/earned impressions entered</Text>}
      </Text>

      <View style={{ marginTop: 12 }}>
        <Text style={s.sectionLede}>Equivalent media value — three views</Text>
        <View style={s.tHead}>
          <Text style={[s.th, { width: '28%' }]}>Tier</Text>
          <Text style={[s.th, { width: '26%', textAlign: 'right' }]}>Audience value</Text>
          <Text style={[s.th, { width: '24%', textAlign: 'right' }]}>Impressions</Text>
          <Text style={[s.th, { width: '22%', textAlign: 'right' }]}>Total</Text>
        </View>
        {mv.tiers.map((t) => emvRow(t, t.tier === 'typical'))}
        {mv.downshifted && (
          <Text style={[s.footnote, { color: PDF.accent }]}>
            Headline downshifted to executive-dinner parity: the qualified-executive mix is below the 60% threshold for per-lead valuation.
          </Text>
        )}
        <View style={{ marginTop: 6 }}>
          {mv.tiers.map((t) => (
            <Text key={t.tier} style={s.footnote}>
              <Text style={{ fontWeight: 700 }}>{t.label}.</Text> {t.methodology}
            </Text>
          ))}
        </View>
      </View>

      <View style={s.hairline} />
      <Text style={s.sectionLede}>Objective · Activation</Text>
      <Text style={s.sectionTitle}>Who actually showed up</Text>
      <Text style={[s.body, { marginTop: 6, marginBottom: 8 }]}>{payload.narrative.activationSummary}</Text>
      <View style={s.tHead}>
        <Text style={[s.th, { width: '40%' }]}>Access tier</Text>
        <Text style={[s.th, { width: '20%', textAlign: 'right' }]}>Registered</Text>
        <Text style={[s.th, { width: '20%', textAlign: 'right' }]}>Attended</Text>
        <Text style={[s.th, { width: '20%', textAlign: 'right' }]}>Show rate</Text>
      </View>
      {payload.audience.scanByTier.map(scanRow)}
      <View style={[s.tRow, { borderBottomWidth: 0 }]}>
        <Text style={[s.td, { width: '40%', fontWeight: 700 }]}>All access</Text>
        <Text style={[s.tdMuted, { width: '20%', textAlign: 'right' }]}>{fmtInt(payload.audience.registered)}</Text>
        <Text style={[s.tdMuted, { width: '20%', textAlign: 'right' }]}>{fmtInt(payload.audience.attended)}</Text>
        <Text style={[s.td, { width: '20%', textAlign: 'right', fontWeight: 700 }]}>{fmtPct(payload.audience.overallScanRate)}</Text>
      </View>

      <Footer payload={payload} page="Awareness & activation" />
    </Page>
  );
}

/* ── Page 4 — Affinity & Acquisition + Deliverables ─────────────────────────── */
function ModuleBlock({ obj, payload }: { obj: ObjectiveResult; payload: RecapPayload }) {
  const m = statusMeta(obj.status);
  return (
    <View style={s.col}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={s.sectionLede}>Objective · {obj.objective}</Text>
        <Text style={[s.objStatus, { color: m.color }]}>{m.label}</Text>
      </View>
      <Text style={[s.bodyInk, { fontWeight: 500 }]}>{obj.headline}</Text>
      <Text style={[s.body, { marginTop: 4 }]}>{obj.whatThisMeans}</Text>
      <Text style={[s.heroBench, { marginTop: 4 }]}>{obj.benchmark}</Text>
      {obj.objective === 'Affinity' && payload.affinity && payload.affinity.quotes.length > 0 && (
        <View style={{ marginTop: 8 }}>
          {payload.affinity.quotes.slice(0, 2).map((q, i) => (
            <Text key={i} style={[s.pullquote, { fontSize: 11, marginBottom: 4 }]}>“{q}”</Text>
          ))}
        </View>
      )}
    </View>
  );
}

function DeliverablesBlock({ proofs }: { proofs: DeliverableProof[] }) {
  if (proofs.length === 0) {
    return <Text style={s.body}>No deliverables recorded for this activation yet.</Text>;
  }
  return (
    <View style={s.proofRow}>
      {proofs.map((p, i) => (
        <View key={i} style={s.proofCard} wrap={false}>
          {p.imageDataUri ? (
            <Image style={s.proofImg} src={p.imageDataUri} />
          ) : (
            <View style={s.proofPlaceholder}>
              <Text style={[s.footnote, { color: PDF.faint }]}>Awaiting photo</Text>
            </View>
          )}
          <Text style={s.proofLabel}>{p.label}</Text>
          <Text style={[s.proofStatus, { color: p.status === 'verified' ? PDF.accent : PDF.faint }]}>
            {p.status === 'verified' ? 'Verified · photo on file' : (p.note ?? 'Pending')}
          </Text>
        </View>
      ))}
    </View>
  );
}

function AffinityAcquisitionPage({ payload }: { payload: RecapPayload }) {
  const affinity = payload.objectives.find((o) => o.objective === 'Affinity')!;
  const acquisition = payload.objectives.find((o) => o.objective === 'Acquisition')!;
  return (
    <Page size="LETTER" style={s.page}>
      <Text style={s.sectionLede}>Objectives · Affinity & Acquisition</Text>
      <Text style={s.sectionTitle}>Feeling &amp; pipeline</Text>
      <View style={[s.twoCol, { marginTop: 10 }]}>
        <ModuleBlock obj={affinity} payload={payload} />
        <ModuleBlock obj={acquisition} payload={payload} />
      </View>

      <View style={s.hairline} />
      <Text style={s.sectionLede}>Deliverables audit · photo proof</Text>
      <Text style={s.sectionTitle}>What we promised, what we delivered</Text>
      <View style={{ marginTop: 4 }}>
        <DeliverablesBlock proofs={payload.deliverables} />
      </View>

      <Footer payload={payload} page="Affinity, acquisition & deliverables" />
    </Page>
  );
}

/* ── Page 5 — What We Recommend Next Year ───────────────────────────────────── */
function RecommendationPage({ payload }: { payload: RecapPayload }) {
  return (
    <Page size="LETTER" style={s.page}>
      <Text style={s.sectionLede}>The close</Text>
      <Text style={s.sectionTitle}>What we recommend next year</Text>
      <View style={s.hairline} />
      <Text style={[s.pullquote, { marginTop: 6 }]}>{payload.narrative.renewal}</Text>
      <View style={{ marginTop: 24 }}>
        <Text style={[s.body, { maxWidth: 460 }]}>
          This recap was generated from verified attendance, check-in and audience data for{' '}
          <Text style={{ fontWeight: 700, color: PDF.ink }}>{payload.event.name}</Text>. Every figure is computed from
          first-party records and benchmarked against paid-media equivalents — nothing here is estimated by hand.
        </Text>
      </View>
      <View style={{ marginTop: 28 }}>
        <Text style={[s.displaySub, { color: PDF.ink, fontSize: 18 }]}>No Bad Company</Text>
        <Text style={s.footnote}>Prepared for {payload.sponsor.name} · {payload.event.dateLabel}</Text>
      </View>
      <Footer payload={payload} page="Recommendation" />
    </Page>
  );
}

export function RecapDocument({ payload }: { payload: RecapPayload }) {
  return (
    <Document title={`${payload.sponsor.name} — ${payload.event.name} Activation Recap`} author="No Bad Company">
      <CoverPage payload={payload} />
      <AudiencePage payload={payload} />
      <AwarenessActivationPage payload={payload} />
      <AffinityAcquisitionPage payload={payload} />
      <RecommendationPage payload={payload} />
    </Document>
  );
}
