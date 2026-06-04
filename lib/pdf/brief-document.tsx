/**
 * Audience Intelligence Brief — the pre-sale editorial PDF (@react-pdf/renderer, Phase 2b).
 *
 * Renders a RecapPayload of kind 'audience_intelligence_brief': cover + projected value, the
 * audience deep-dive, and the projected equivalent-media-value range with a recommendation.
 * Same brand type + cream palette as the recap; colors only from lib/pdf/palette (the documented
 * hex exception).
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { INFLUENCE_TIER_META } from '@/lib/intelligence/influence-tiers';
import { fmtInt, fmtMultiple, fmtPct, fmtUsdCents, fmtUsdCompact } from '@/lib/intelligence/recap-format';
import type { DistributionCell, HeroStat, RecapPayload } from '@/lib/intelligence/recap-types';
import { PDF, TIER_COLORS } from './palette';
import { SANS, SERIF } from './fonts';

const s = StyleSheet.create({
  page: { backgroundColor: PDF.paper, color: PDF.ink, fontFamily: SANS, fontSize: 9.5, lineHeight: 1.5, paddingTop: 54, paddingBottom: 56, paddingHorizontal: 54 },
  kicker: { fontFamily: SANS, fontSize: 8, fontWeight: 700, letterSpacing: 2, color: PDF.accent, textTransform: 'uppercase' },
  wordmark: { fontFamily: SANS, fontSize: 7.5, fontWeight: 500, letterSpacing: 2.5, color: PDF.faint, textTransform: 'uppercase' },
  title: { fontFamily: SERIF, fontSize: 32, fontWeight: 700, lineHeight: 1.05, marginTop: 6 },
  standfirst: { fontFamily: SERIF, fontSize: 12, fontStyle: 'italic', color: PDF.muted, lineHeight: 1.45, marginTop: 14, maxWidth: 460 },
  hairline: { borderBottomWidth: 0.75, borderBottomColor: PDF.rule, marginVertical: 16 },
  sectionLede: { fontFamily: SANS, fontSize: 9, color: PDF.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  sectionTitle: { fontFamily: SERIF, fontSize: 21, fontWeight: 700, marginBottom: 4 },
  body: { fontFamily: SANS, fontSize: 9.5, color: PDF.muted, lineHeight: 1.55 },
  pullquote: { fontFamily: SERIF, fontSize: 13, fontStyle: 'italic', color: PDF.ink, lineHeight: 1.5 },

  band: { backgroundColor: PDF.ink, borderRadius: 4, paddingVertical: 18, paddingHorizontal: 22, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bandBig: { fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: PDF.onRed, lineHeight: 1 },
  bandCap: { fontFamily: SANS, fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase', color: PDF.onInkMuted, marginTop: 6 },
  bandMult: { fontFamily: SERIF, fontSize: 18, fontStyle: 'italic', color: PDF.onRed, textAlign: 'right', lineHeight: 1 },
  bandMultCap: { fontFamily: SANS, fontSize: 7.5, letterSpacing: 1, textTransform: 'uppercase', color: PDF.onInkMuted, textAlign: 'right', marginTop: 2 },

  heroRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 18, marginHorizontal: -6 },
  heroCell: { width: '20%', paddingHorizontal: 6 },
  heroValue: { fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: PDF.ink },
  heroLabel: { fontFamily: SANS, fontSize: 7.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: PDF.accent, marginTop: 3 },
  heroMeans: { fontFamily: SANS, fontSize: 7.5, color: PDF.muted, marginTop: 3, lineHeight: 1.4 },
  heroBench: { fontFamily: SANS, fontSize: 7, fontStyle: 'italic', color: PDF.faint, marginTop: 2, lineHeight: 1.35 },

  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  barLabel: { width: 150, fontFamily: SANS, fontSize: 9, color: PDF.ink },
  barTrack: { flex: 1, height: 9, backgroundColor: PDF.cream, borderRadius: 2, marginHorizontal: 8, borderWidth: 0.5, borderColor: PDF.rule },
  barFill: { height: 9, borderRadius: 2 },
  barVal: { width: 78, fontFamily: SANS, fontSize: 8.5, color: PDF.muted, textAlign: 'right' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, marginTop: 4 },
  chip: { borderWidth: 0.5, borderColor: PDF.rule, borderRadius: 3, backgroundColor: PDF.card, paddingVertical: 4, paddingHorizontal: 8, margin: 3 },
  chipLabel: { fontFamily: SANS, fontSize: 8.5, color: PDF.ink },
  chipVal: { fontFamily: SANS, fontSize: 8.5, fontWeight: 700, color: PDF.accent },

  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: PDF.rule, paddingVertical: 6 },
  tHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: PDF.ink, paddingBottom: 5 },
  th: { fontFamily: SANS, fontSize: 7.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: PDF.faint },
  td: { fontFamily: SANS, fontSize: 9.5, color: PDF.ink },
  tdMuted: { fontFamily: SANS, fontSize: 9, color: PDF.muted },
  rowHi: { backgroundColor: PDF.cream },
  footnote: { fontFamily: SANS, fontSize: 7, color: PDF.faint, lineHeight: 1.4, marginTop: 4 },
  twoCol: { flexDirection: 'row', marginHorizontal: -12 },
  col: { flex: 1, paddingHorizontal: 12 },
  footer: { position: 'absolute', bottom: 28, left: 54, right: 54, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: PDF.rule, paddingTop: 7 },
  footerText: { fontFamily: SANS, fontSize: 7, color: PDF.faint, letterSpacing: 0.5 },
});

function Footer({ payload, page }: { payload: RecapPayload; page: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>NO BAD COMPANY  ·  PREPARED FOR {payload.sponsor.name.toUpperCase()}</Text>
      <Text style={s.footerText}>{page}  ·  CONFIDENTIAL</Text>
    </View>
  );
}

function chips(cells: DistributionCell[]) {
  if (!cells.length) return <Text style={s.body}>Not on file.</Text>;
  return cells.map((c, i) => (
    <View key={i} style={s.chip} wrap={false}>
      <Text style={s.chipLabel}>
        {c.suppressed ? `${c.label} (combined)` : c.label}{'  '}
        <Text style={s.chipVal}>{fmtInt(c.count)} · {fmtPct(c.pct)}</Text>
      </Text>
    </View>
  ));
}

export function BriefDocument({ payload }: { payload: RecapPayload }) {
  const a = payload.audience;
  const mv = payload.mediaValue;
  const tierRows = a.influenceDistribution.filter((d) => !d.suppressed);
  const suppressedCount = a.influenceDistribution.filter((d) => d.suppressed).reduce((acc, d) => acc + d.count, 0);

  return (
    <Document title={`${payload.sponsor.name} — Audience Intelligence Brief`} author="No Bad Company">
      {/* Page 1 — cover */}
      <Page size="LETTER" style={s.page}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={s.kicker}>Audience Intelligence Brief</Text>
          <Text style={s.wordmark}>No Bad Company</Text>
        </View>
        <Text style={s.title}>{payload.sponsor.name}</Text>
        <Text style={s.standfirst}>{payload.narrative.coverStandfirst}</Text>

        <View style={s.band}>
          <View>
            <Text style={s.bandBig}>{fmtUsdCompact(mv.headline.totalCents)}</Text>
            <Text style={s.bandCap}>Projected media value · one activation</Text>
          </View>
          {mv.valueVsFeeMultiple != null && (
            <View>
              <Text style={s.bandMult}>{fmtMultiple(mv.valueVsFeeMultiple)}</Text>
              <Text style={s.bandMultCap}>Against your rights fee</Text>
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

        <Text style={[s.body, { marginTop: 22, maxWidth: 470 }]}>{payload.narrative.audienceSummary}</Text>
        <Footer payload={payload} page="Overview" />
      </Page>

      {/* Page 2 — who you'd reach */}
      <Page size="LETTER" style={s.page}>
        <Text style={s.sectionLede}>The audience</Text>
        <Text style={s.sectionTitle}>Who you&rsquo;d reach</Text>
        <Text style={[s.body, { marginTop: 6, marginBottom: 12 }]}>
          {fmtInt(a.registered)} vetted, approved members — an aggregate influence score of {a.aggregateInfluenceScore} out of 100.
        </Text>

        <Text style={s.sectionLede}>Influence tiers</Text>
        {tierRows.map((d, i) => (
          <View key={i} style={s.barRow} wrap={false}>
            <Text style={s.barLabel}>{INFLUENCE_TIER_META[d.tier].label}</Text>
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${Math.max(2, Math.round(d.pct * 100))}%`, backgroundColor: TIER_COLORS[d.tier] ?? PDF.muted }]} />
            </View>
            <Text style={s.barVal}>{fmtInt(d.count)} · {fmtPct(d.pct)}</Text>
          </View>
        ))}
        {suppressedCount > 0 && (
          <View style={s.barRow} wrap={false}>
            <Text style={s.barLabel}>Other (fewer than 5 each)</Text>
            <View style={s.barTrack} />
            <Text style={s.barVal}>{fmtInt(suppressedCount)}</Text>
          </View>
        )}

        <View style={s.hairline} />
        <View style={s.twoCol}>
          <View style={s.col}>
            <Text style={s.sectionLede}>Seniority</Text>
            <View style={s.chipWrap}>{chips(a.senioritySpread)}</View>
          </View>
          <View style={s.col}>
            <Text style={s.sectionLede}>Industry</Text>
            <View style={s.chipWrap}>{chips(a.industrySpread)}</View>
          </View>
        </View>
        {a.personaMatchPct != null && (
          <View style={{ marginTop: 16 }}>
            <Text style={s.sectionLede}>Match to your target persona</Text>
            <Text style={[s.heroValue, { fontSize: 26 }]}>{a.personaMatchSuppressed ? '—' : fmtPct(a.personaMatchPct)}</Text>
            <Text style={s.heroMeans}>Share of the membership matching the audience defined in your Sponsor Brief.</Text>
          </View>
        )}
        <Text style={s.footnote}>Any group smaller than five is combined so no individual can be identified.</Text>
        <Footer payload={payload} page="The audience" />
      </Page>

      {/* Page 3 — projected value + recommendation */}
      <Page size="LETTER" style={s.page}>
        <Text style={s.sectionLede}>What an activation is worth</Text>
        <Text style={s.sectionTitle}>Projected equivalent media value</Text>
        <Text style={[s.body, { marginTop: 6, marginBottom: 10 }]}>
          A projection for one activation, modelled on ~{fmtInt(mv.inputs.attendeeCount)} in-person attendees at this audience&rsquo;s seniority. Owned and earned reach is an estimate until the activation is scoped.
        </Text>

        <View style={s.tHead}>
          <Text style={[s.th, { width: '28%' }]}>Tier</Text>
          <Text style={[s.th, { width: '26%', textAlign: 'right' }]}>Audience value</Text>
          <Text style={[s.th, { width: '24%', textAlign: 'right' }]}>Impressions</Text>
          <Text style={[s.th, { width: '22%', textAlign: 'right' }]}>Total</Text>
        </View>
        {mv.tiers.map((t) => (
          <View key={t.tier} style={[s.tRow, t.tier === 'typical' ? s.rowHi : {}]} wrap={false}>
            <Text style={[s.td, { width: '28%', fontWeight: t.tier === 'typical' ? 700 : 400 }]}>{t.label}{t.tier === 'typical' ? '  (headline)' : ''}</Text>
            <Text style={[s.tdMuted, { width: '26%', textAlign: 'right' }]}>{fmtUsdCents(t.audienceValueCents)}</Text>
            <Text style={[s.tdMuted, { width: '24%', textAlign: 'right' }]}>{fmtUsdCents(t.impressionValueCents)}</Text>
            <Text style={[s.td, { width: '22%', textAlign: 'right', fontWeight: 700 }]}>{fmtUsdCents(t.totalCents)}</Text>
          </View>
        ))}
        <View style={{ marginTop: 6 }}>
          {mv.tiers.map((t) => (
            <Text key={t.tier} style={s.footnote}><Text style={{ fontWeight: 700 }}>{t.label}.</Text> {t.methodology}</Text>
          ))}
        </View>

        <View style={s.hairline} />
        <Text style={s.sectionLede}>What we&rsquo;d recommend</Text>
        <Text style={[s.pullquote, { marginTop: 4 }]}>{payload.narrative.renewal}</Text>
        <View style={{ marginTop: 26 }}>
          <Text style={[s.title, { fontSize: 18 }]}>No Bad Company</Text>
          <Text style={s.footnote}>Prepared for {payload.sponsor.name} · {payload.event.dateLabel}</Text>
        </View>
        <Footer payload={payload} page="Projected value" />
      </Page>
    </Document>
  );
}
