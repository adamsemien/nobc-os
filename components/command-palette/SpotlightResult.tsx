'use client';

import { ArrowUpRight } from 'lucide-react';
import type {
  SpotlightField,
  SpotlightPayload,
  SpotlightRow,
} from '@/lib/agent/lib/spotlight';

const EDITORIAL = "'PP Editorial New', Georgia, serif";

/** Renders one agent tool result as a navigable Spotlight card.
 *  `selectedIndex` is the keyboard-selected navigation target within this
 *  result (null when this result is not the active one). */
export function SpotlightResult({
  payload,
  selectedIndex,
  onNavigate,
}: {
  payload: SpotlightPayload;
  selectedIndex: number | null;
  onNavigate: (href: string) => void;
}) {
  switch (payload.kind) {
    case 'empty':
      return (
        <div
          data-spotlight="empty"
          style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)' }}
        >
          {payload.message}
        </div>
      );
    case 'record-list':
      return (
        <div data-spotlight="record-list" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <ResultHeading text={payload.title} />
          {payload.rows.map((row, i) => (
            <RowItem
              key={row.id || i}
              row={row}
              selected={selectedIndex === i}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      );
    case 'record':
      return (
        <RecordCard payload={payload} selected={selectedIndex === 0} onNavigate={onNavigate} />
      );
    case 'metric':
      return (
        <MetricCard payload={payload} selected={selectedIndex === 0} onNavigate={onNavigate} />
      );
    case 'composition':
      return (
        <CompositionCard
          payload={payload}
          selected={selectedIndex === 0}
          onNavigate={onNavigate}
        />
      );
    case 'mutation':
      return (
        <MutationCard payload={payload} selected={selectedIndex === 0} onNavigate={onNavigate} />
      );
  }
}

// ── shared bits ────────────────────────────────────────────────────────

function ResultHeading({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.16em',
        color: 'var(--text-muted)',
        padding: '0 0 4px',
      }}
    >
      {text}
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: 10.5,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        padding: '2px 8px',
        borderRadius: 5,
        background: 'var(--raised)',
        color: 'var(--text-secondary)',
      }}
    >
      {text}
    </span>
  );
}

/** Visual treatment shared by every clickable Spotlight card. */
function cardStyle(selected: boolean, clickable: boolean): React.CSSProperties {
  return {
    width: '100%',
    textAlign: 'left',
    display: 'block',
    padding: 14,
    borderRadius: 10,
    background: 'var(--card)',
    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
    boxShadow: selected ? '0 0 0 3px var(--accent-soft)' : 'none',
    cursor: clickable ? 'pointer' : 'default',
    font: 'inherit',
    color: 'inherit',
  };
}

function FieldGrid({ fields }: { fields: SpotlightField[] }) {
  if (fields.length === 0) return null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px 16px',
        marginTop: 10,
      }}
    >
      {fields.map((f) => (
        <div key={f.label}>
          <div
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--text-muted)',
            }}
          >
            {f.label}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 1 }}>
            {f.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function NavHint({ selected }: { selected: boolean }) {
  return (
    <ArrowUpRight
      size={15}
      strokeWidth={2}
      style={{ color: selected ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}
    />
  );
}

// ── record-list row ────────────────────────────────────────────────────

function RowItem({
  row,
  selected,
  onNavigate,
}: {
  row: SpotlightRow;
  selected: boolean;
  onNavigate: (href: string) => void;
}) {
  const clickable = !!row.href;
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-selected={selected ? 'true' : 'false'}
      disabled={!clickable}
      onClick={() => row.href && onNavigate(row.href)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        padding: '9px 12px',
        borderRadius: 8,
        border: 'none',
        borderLeft: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
        background: selected ? 'var(--accent-soft)' : 'transparent',
        cursor: clickable ? 'pointer' : 'default',
        font: 'inherit',
        color: 'inherit',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text-primary)',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.title}
        </div>
        {row.subtitle && (
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--text-muted)',
              lineHeight: 1.35,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {row.subtitle}
          </div>
        )}
      </div>
      {row.meta && (
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0 }}>
          {row.meta}
        </span>
      )}
      {clickable && <NavHint selected={selected} />}
    </button>
  );
}

// ── record card ────────────────────────────────────────────────────────

function RecordCard({
  payload,
  selected,
  onNavigate,
}: {
  payload: Extract<SpotlightPayload, { kind: 'record' }>;
  selected: boolean;
  onNavigate: (href: string) => void;
}) {
  const clickable = !!payload.href;
  return (
    <button
      type="button"
      data-spotlight={payload.kind}
      disabled={!clickable}
      onClick={() => payload.href && onNavigate(payload.href)}
      style={cardStyle(selected, clickable)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: EDITORIAL,
              fontStyle: 'italic',
              fontWeight: 200,
              fontSize: 21,
              lineHeight: 1.15,
              color: 'var(--text-primary)',
            }}
          >
            {payload.title}
          </div>
          {payload.subtitle && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
              {payload.subtitle}
            </div>
          )}
        </div>
        {payload.badge && <Badge text={payload.badge} />}
        {clickable && <NavHint selected={selected} />}
      </div>

      <FieldGrid fields={payload.fields} />

      {payload.detail && payload.detail.length > 0 && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: '1px solid var(--border)',
            maxHeight: 200,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {payload.detail.map((d, i) => (
            <div key={i}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.label}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 1 }}>
                {d.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

// ── metric tile ────────────────────────────────────────────────────────

function MetricCard({
  payload,
  selected,
  onNavigate,
}: {
  payload: Extract<SpotlightPayload, { kind: 'metric' }>;
  selected: boolean;
  onNavigate: (href: string) => void;
}) {
  const clickable = !!payload.href;
  return (
    <button
      type="button"
      data-spotlight={payload.kind}
      disabled={!clickable}
      onClick={() => payload.href && onNavigate(payload.href)}
      style={cardStyle(selected, clickable)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div
          style={{
            flex: 1,
            fontFamily: EDITORIAL,
            fontStyle: 'italic',
            fontWeight: 200,
            fontSize: 18,
            color: 'var(--text-primary)',
          }}
        >
          {payload.name}
        </div>
        {clickable && <NavHint selected={selected} />}
      </div>
      {payload.valueLabel && (
        <div
          style={{
            fontSize: 32,
            fontWeight: 600,
            lineHeight: 1.1,
            color: 'var(--accent)',
            marginTop: 6,
          }}
        >
          {payload.valueLabel}
        </div>
      )}
      {payload.insight && (
        <div
          style={{
            fontSize: 12.5,
            fontStyle: 'italic',
            color: 'var(--text-secondary)',
            marginTop: payload.valueLabel ? 8 : 6,
            lineHeight: 1.5,
          }}
        >
          {payload.insight}
        </div>
      )}
    </button>
  );
}

// ── composition ────────────────────────────────────────────────────────

function CompositionCard({
  payload,
  selected,
  onNavigate,
}: {
  payload: Extract<SpotlightPayload, { kind: 'composition' }>;
  selected: boolean;
  onNavigate: (href: string) => void;
}) {
  const clickable = !!payload.href;
  return (
    <button
      type="button"
      data-spotlight={payload.kind}
      disabled={!clickable}
      onClick={() => payload.href && onNavigate(payload.href)}
      style={cardStyle(selected, clickable)}
    >
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {payload.narrative}
      </div>
      {payload.metrics.length > 0 && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {payload.metrics.map((m, i) => (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {m.name}
                </span>
                {m.valueLabel && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
                    {m.valueLabel}
                  </span>
                )}
              </div>
              {m.insight && (
                <div
                  style={{
                    fontSize: 12,
                    fontStyle: 'italic',
                    color: 'var(--text-muted)',
                    marginTop: 1,
                    lineHeight: 1.45,
                  }}
                >
                  {m.insight}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {clickable && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            marginTop: 12,
            fontSize: 11.5,
            color: selected ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          <ArrowUpRight size={13} strokeWidth={2} />
          View in Intelligence
        </div>
      )}
    </button>
  );
}

// ── mutation card ──────────────────────────────────────────────────────

function MutationCard({
  payload,
  selected,
  onNavigate,
}: {
  payload: Extract<SpotlightPayload, { kind: 'mutation' }>;
  selected: boolean;
  onNavigate: (href: string) => void;
}) {
  const clickable = !!payload.href;
  const accent = payload.ok ? 'var(--success)' : 'var(--danger)';
  return (
    <button
      type="button"
      data-spotlight={payload.kind}
      disabled={!clickable}
      onClick={() => payload.href && onNavigate(payload.href)}
      style={cardStyle(selected, clickable)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span
          style={{
            flexShrink: 0,
            width: 20,
            height: 20,
            borderRadius: 999,
            background: accent,
            color: 'var(--surface)',
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {payload.ok ? '✓' : '✕'}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
            {payload.title}
          </div>
          {payload.detail && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
              {payload.detail}
            </div>
          )}
        </div>
        {clickable && <NavHint selected={selected} />}
      </div>
    </button>
  );
}
