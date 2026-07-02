'use client';

/** Access Gate Builder (Stage 17, M3) - split view.
 *
 *  Left: compose the gate tree (root rule, steps, one nested group level -
 *  the engine's depth law). Right: the live guest preview, rendered from the
 *  same projector the public walkthrough uses, plus shareable access links.
 *
 *  Condition types render with friendly labels only - raw registry keys are
 *  the wire format, never UI copy. Session statuses are mapped to display
 *  strings the same way.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Plus, Trash2 } from 'lucide-react';

const editorial = { fontFamily: "'PP Editorial New', Georgia, serif" };

// ── Wire shapes (server JSON) ───────────────────────────────────────────────

type TreeNode = {
  id: string;
  kind: 'GROUP' | 'CONDITION';
  required: boolean;
  weight: number | null;
  rule: 'ALL' | 'ANY_N' | 'WEIGHTED' | null;
  requiredCount: number | null;
  weightThreshold: number | null;
  children: TreeNode[];
  conditionType: string | null;
  config: unknown;
};

type LoadedGate = { gateId: string; name: string | null; tree: TreeNode | null };

type GuestView =
  | { available: false }
  | {
      available: true;
      open: boolean;
      headline: string;
      needsIdentity: boolean;
      sections: { headline: string; satisfied: boolean; steps: { nodeId: string; prompt: string; state: string; required: boolean }[] }[];
    };

type SessionRow = {
  id: string;
  token: string;
  status: string;
  createdAt: string;
  member: { name: string; email: string } | null;
};

// ── Draft model (client-side tree) ──────────────────────────────────────────

type Rule = 'ALL' | 'ANY_N' | 'WEIGHTED';

type DraftCondition = {
  kind: 'CONDITION';
  key: string;
  id?: string;
  conditionType: string;
  config: Record<string, unknown>;
  required: boolean;
  weight: number;
};

type DraftGroup = {
  kind: 'GROUP';
  key: string;
  id?: string;
  rule: Rule;
  requiredCount: number;
  weightThreshold: number;
  required: boolean;
  weight: number;
  children: DraftNode[];
};

type DraftNode = DraftCondition | DraftGroup;

let keySeq = 0;
const nextKey = () => `draft-${++keySeq}`;

const CONDITION_CATALOG: {
  type: string;
  label: string;
  hint: string;
  defaultConfig: Record<string, unknown>;
}[] = [
  {
    type: 'PAY',
    label: 'Buy a ticket',
    hint: 'Verified against the payment record. Payment never carries between events.',
    defaultConfig: { priceCents: 2500 },
  },
  {
    type: 'ANSWER_QUESTIONS',
    label: 'Submit an application',
    hint: 'AI-scored; unclear results go to human review. Valid for 12 months.',
    defaultConfig: {},
  },
  {
    type: 'REFERRED_BY_MEMBER',
    label: 'Referred by a member',
    hint: 'Checks the referral on file. No guest action needed.',
    defaultConfig: {},
  },
  {
    type: 'ATTENDED_PRIOR',
    label: 'Attended before',
    hint: 'Checks prior event check-ins. No guest action needed.',
    defaultConfig: {},
  },
  {
    type: 'HOLD_MEMBERSHIP',
    label: 'Active member',
    hint: 'Live membership check on every visit - revoked members never pass.',
    defaultConfig: {},
  },
];

const CONDITION_LABEL: Record<string, string> = Object.fromEntries(
  CONDITION_CATALOG.map((c) => [c.type, c.label]),
);

const RULE_OPTIONS: { value: Rule; label: string }[] = [
  { value: 'ALL', label: 'All steps' },
  { value: 'ANY_N', label: 'Any N steps' },
  { value: 'WEIGHTED', label: 'Point threshold' },
];

const SESSION_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'In progress',
  SATISFIED: 'On the list',
  EXPIRED: 'Expired',
};

function blankCondition(type: string): DraftCondition {
  const entry = CONDITION_CATALOG.find((c) => c.type === type);
  return {
    kind: 'CONDITION',
    key: nextKey(),
    conditionType: type,
    config: { ...(entry?.defaultConfig ?? {}) },
    required: false,
    weight: 1,
  };
}

function blankGroup(): DraftGroup {
  return {
    kind: 'GROUP',
    key: nextKey(),
    rule: 'ANY_N',
    requiredCount: 1,
    weightThreshold: 1,
    required: false,
    weight: 1,
    children: [],
  };
}

function fromTree(node: TreeNode): DraftNode {
  if (node.kind === 'CONDITION') {
    return {
      kind: 'CONDITION',
      key: nextKey(),
      id: node.id,
      conditionType: node.conditionType ?? '',
      config: (node.config as Record<string, unknown>) ?? {},
      required: node.required,
      weight: node.weight ?? 1,
    };
  }
  return {
    kind: 'GROUP',
    key: nextKey(),
    id: node.id,
    rule: node.rule ?? 'ALL',
    requiredCount: node.requiredCount ?? 1,
    weightThreshold: node.weightThreshold ?? 1,
    required: node.required,
    weight: node.weight ?? 1,
    children: node.children.map(fromTree),
  };
}

/** Draft -> authoring spec. Rule-scoped fields are included only where the
 *  validator allows them (requiredCount on ANY_N, weightThreshold + child
 *  weights on WEIGHTED). */
function toSpec(node: DraftNode, parentRule: Rule | null): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  if (node.id) base.id = node.id;
  if (node.required) base.required = true;
  if (parentRule === 'WEIGHTED') base.weight = node.weight;

  if (node.kind === 'CONDITION') {
    return { ...base, kind: 'CONDITION', conditionType: node.conditionType, config: node.config };
  }
  const group: Record<string, unknown> = {
    ...base,
    kind: 'GROUP',
    rule: node.rule,
    children: node.children.map((child) => toSpec(child, node.rule)),
  };
  if (node.rule === 'ANY_N') group.requiredCount = node.requiredCount;
  if (node.rule === 'WEIGHTED') group.weightThreshold = node.weightThreshold;
  return group;
}

function countConditions(node: DraftNode): number {
  if (node.kind === 'CONDITION') return 1;
  return node.children.reduce((sum, child) => sum + countConditions(child), 0);
}

// ── Small building blocks ───────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
      {children}
    </span>
  );
}

function NumberInput({
  value,
  min,
  onChange,
  className,
  step,
}: {
  value: number;
  min: number;
  onChange: (n: number) => void;
  className?: string;
  step?: string;
}) {
  return (
    <input
      type="number"
      min={min}
      step={step ?? '1'}
      value={Number.isFinite(value) ? value : min}
      onChange={(e) => {
        const n = step ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
        onChange(Number.isFinite(n) ? n : min);
      }}
      className={`rounded-sm border border-border bg-card px-2 py-1.5 text-sm text-text-primary focus:border-primary focus:outline-none ${className ?? 'w-20'}`}
    />
  );
}

function RulePicker({
  rule,
  onChange,
}: {
  rule: Rule;
  onChange: (rule: Rule) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-sm border border-border">
      {RULE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            rule === opt.value
              ? 'bg-primary text-on-primary'
              : 'bg-card text-text-secondary hover:text-text-primary'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function AddStepMenu({
  onAdd,
  label = 'Add step',
}: {
  onAdd: (type: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-primary hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        {label}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-10 mt-1 w-72 overflow-hidden rounded-sm border border-border bg-card shadow-sm">
          {CONDITION_CATALOG.map((entry) => (
            <button
              key={entry.type}
              type="button"
              onClick={() => {
                onAdd(entry.type);
                setOpen(false);
              }}
              className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-raised"
            >
              <span className="block text-sm font-medium text-text-primary">{entry.label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-text-muted">{entry.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConditionConfigFields({
  condition,
  onChange,
}: {
  condition: DraftCondition;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const cfg = condition.config;
  if (condition.conditionType === 'PAY') {
    const cents = typeof cfg.priceCents === 'number' ? cfg.priceCents : 0;
    return (
      <label className="flex items-center gap-2">
        <FieldLabel>Price $</FieldLabel>
        <NumberInput
          value={cents / 100}
          min={0}
          step="0.01"
          onChange={(n) => onChange({ ...cfg, priceCents: Math.round(n * 100) })}
          className="w-24"
        />
      </label>
    );
  }
  if (condition.conditionType === 'ANSWER_QUESTIONS') {
    const minScore = typeof cfg.minScore === 'number' ? cfg.minScore : null;
    return (
      <label className="flex items-center gap-2">
        <FieldLabel>Minimum score</FieldLabel>
        <NumberInput
          value={minScore ?? 0}
          min={0}
          onChange={(n) => {
            const next = { ...cfg };
            if (n > 0) next.minScore = Math.min(n, 100);
            else delete next.minScore;
            onChange(next);
          }}
        />
        <span className="text-xs text-text-muted">0 = recommendation alone decides</span>
      </label>
    );
  }
  if (condition.conditionType === 'ATTENDED_PRIOR') {
    const minCount = typeof cfg.minCount === 'number' ? cfg.minCount : 1;
    return (
      <label className="flex items-center gap-2">
        <FieldLabel>Prior visits</FieldLabel>
        <NumberInput
          value={minCount}
          min={1}
          onChange={(n) => onChange({ ...cfg, minCount: Math.max(1, n) })}
        />
      </label>
    );
  }
  return null;
}

function ConditionCard({
  condition,
  parentRule,
  onChange,
  onRemove,
}: {
  condition: DraftCondition;
  parentRule: Rule;
  onChange: (next: DraftCondition) => void;
  onRemove: () => void;
}) {
  const entry = CONDITION_CATALOG.find((c) => c.type === condition.conditionType);
  return (
    <div className="rounded-sm border border-border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text-primary">
            {CONDITION_LABEL[condition.conditionType] ?? 'Step'}
          </p>
          {entry ? (
            <p className="mt-0.5 text-xs leading-snug text-text-muted">{entry.hint}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove step"
          className="text-text-muted transition-colors hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <ConditionConfigFields
          condition={condition}
          onChange={(config) => onChange({ ...condition, config })}
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={condition.required}
            onChange={(e) => onChange({ ...condition, required: e.target.checked })}
            className="h-3.5 w-3.5 accent-[var(--primary)]"
          />
          <FieldLabel>Always required</FieldLabel>
        </label>
        {parentRule === 'WEIGHTED' ? (
          <label className="flex items-center gap-2">
            <FieldLabel>Points</FieldLabel>
            <NumberInput
              value={condition.weight}
              min={1}
              onChange={(n) => onChange({ ...condition, weight: Math.max(1, n) })}
              className="w-16"
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}

function GroupRuleFields({
  group,
  onChange,
}: {
  group: DraftGroup;
  onChange: (next: DraftGroup) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <RulePicker rule={group.rule} onChange={(rule) => onChange({ ...group, rule })} />
      {group.rule === 'ANY_N' ? (
        <label className="flex items-center gap-2">
          <FieldLabel>Steps needed</FieldLabel>
          <NumberInput
            value={group.requiredCount}
            min={1}
            onChange={(n) => onChange({ ...group, requiredCount: Math.max(1, n) })}
            className="w-16"
          />
        </label>
      ) : null}
      {group.rule === 'WEIGHTED' ? (
        <label className="flex items-center gap-2">
          <FieldLabel>Points needed</FieldLabel>
          <NumberInput
            value={group.weightThreshold}
            min={1}
            onChange={(n) => onChange({ ...group, weightThreshold: Math.max(1, n) })}
            className="w-16"
          />
        </label>
      ) : null}
    </div>
  );
}

// ── The tab ─────────────────────────────────────────────────────────────────

export function GateBuilderTab({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(true);
  const [gateExists, setGateExists] = useState(false);
  const [gateName, setGateName] = useState('');
  const [draft, setDraft] = useState<DraftGroup | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [savedFlash, setSavedFlash] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [preview, setPreview] = useState<{ valid: boolean; errors: string[]; view: GuestView | null } | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [minting, setMinting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const savedSpecRef = useRef<string | null>(null);

  const adoptGate = useCallback((gate: LoadedGate | null) => {
    if (gate?.tree && gate.tree.kind === 'GROUP') {
      const root = fromTree(gate.tree) as DraftGroup;
      setDraft(root);
      setGateName(gate.name ?? '');
      setGateExists(true);
      savedSpecRef.current = JSON.stringify(toSpec(root, null));
    } else if (gate) {
      // Gate row exists but its tree is unreadable - fail-closed editor state.
      setGateExists(true);
      setDraft(null);
      savedSpecRef.current = null;
    } else {
      setGateExists(false);
      setDraft(null);
      savedSpecRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [gateRes, sessionsRes] = await Promise.all([
          fetch(`/api/operator/events/${eventId}/gate`),
          fetch(`/api/operator/events/${eventId}/gate/sessions`),
        ]);
        if (cancelled) return;
        if (gateRes.ok) {
          const data = (await gateRes.json()) as { gate: LoadedGate | null };
          adoptGate(data.gate);
        }
        if (sessionsRes.ok) {
          const data = (await sessionsRes.json()) as { sessions: SessionRow[] };
          setSessions(data.sessions);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, adoptGate]);

  const spec = useMemo(() => (draft ? toSpec(draft, null) : null), [draft]);
  const specJson = useMemo(() => (spec ? JSON.stringify(spec) : null), [spec]);
  const dirty = specJson !== null && specJson !== savedSpecRef.current;
  const stepCount = draft ? countConditions(draft) : 0;

  // Live preview - debounced against the draft spec.
  useEffect(() => {
    if (!specJson || stepCount === 0) {
      setPreview(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/operator/events/${eventId}/gate/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spec: JSON.parse(specJson) }),
        });
        if (res.ok) {
          setPreview((await res.json()) as { valid: boolean; errors: string[]; view: GuestView | null });
        }
      } catch {
        // Preview is advisory; a failed fetch just keeps the last render.
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [specJson, stepCount, eventId]);

  const updateChild = (key: string, next: DraftNode | null) => {
    setDraft((current) => {
      if (!current) return current;
      const replaceIn = (group: DraftGroup): DraftGroup => ({
        ...group,
        children: group.children
          .map((child) => {
            if (child.key === key) return next;
            if (child.kind === 'GROUP') return replaceIn(child);
            return child;
          })
          .filter((child): child is DraftNode => child !== null),
      });
      return replaceIn(current);
    });
  };

  const addToGroup = (groupKey: string | null, node: DraftNode) => {
    setDraft((current) => {
      if (!current) return current;
      if (groupKey === null || current.key === groupKey) {
        return { ...current, children: [...current.children, node] };
      }
      return {
        ...current,
        children: current.children.map((child) =>
          child.kind === 'GROUP' && child.key === groupKey
            ? { ...child, children: [...child.children, node] }
            : child,
        ),
      };
    });
  };

  const save = async () => {
    if (!spec) return;
    setSaving(true);
    setSaveErrors([]);
    try {
      const res = await fetch(`/api/operator/events/${eventId}/gate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gateName.trim() || null, spec }),
      });
      if (res.status === 422) {
        const data = (await res.json()) as { errors: string[] };
        setSaveErrors(data.errors);
        return;
      }
      if (!res.ok) {
        setSaveErrors(['The gate could not be saved. Try again.']);
        return;
      }
      const data = (await res.json()) as { gate: LoadedGate | null };
      adoptGate(data.gate);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const removeGate = async () => {
    setConfirmingDelete(false);
    const res = await fetch(`/api/operator/events/${eventId}/gate`, { method: 'DELETE' });
    if (res.ok) {
      adoptGate(null);
      setPreview(null);
      setSessions([]);
    }
  };

  const mintLink = async () => {
    setMinting(true);
    try {
      const res = await fetch(`/api/operator/events/${eventId}/gate/sessions`, { method: 'POST' });
      if (res.ok) {
        const listRes = await fetch(`/api/operator/events/${eventId}/gate/sessions`);
        if (listRes.ok) {
          const data = (await listRes.json()) as { sessions: SessionRow[] };
          setSessions(data.sessions);
        }
      }
    } finally {
      setMinting(false);
    }
  };

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/gate/${token}`);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 1500);
    } catch {
      // Clipboard unavailable - the token stays visible in the row.
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-text-muted">Loading the gate…</div>;
  }

  if (!draft) {
    return (
      <div className="rounded-lg border border-border bg-card px-8 py-12 text-center">
        <h2 className="text-2xl italic text-text-primary" style={editorial}>
          {gateExists ? 'This gate needs rebuilding' : 'No gate on this event yet'}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-text-secondary">
          {gateExists
            ? 'The stored gate could not be read. Start fresh below - saving will replace it.'
            : 'A gate decides who gets access: combine steps like buying a ticket, a member referral, or an application into one rule.'}
        </p>
        <button
          type="button"
          onClick={() => setDraft({ ...blankGroup(), rule: 'ALL' })}
          className="mt-6 inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Start building
        </button>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      {/* ── Composer ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-5">
        <div className="rounded-lg border border-border bg-card px-5 py-4">
          <label className="flex flex-col gap-1.5">
            <FieldLabel>Gate name (internal)</FieldLabel>
            <input
              type="text"
              value={gateName}
              onChange={(e) => setGateName(e.target.value)}
              placeholder="Door policy"
              className="w-full max-w-sm rounded-sm border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
          </label>
          <div className="mt-4 flex flex-col gap-2">
            <FieldLabel>Guests unlock access with</FieldLabel>
            <GroupRuleFields group={draft} onChange={(next) => setDraft(next)} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {draft.children.map((child) =>
            child.kind === 'CONDITION' ? (
              <ConditionCard
                key={child.key}
                condition={child}
                parentRule={draft.rule}
                onChange={(next) => updateChild(child.key, next)}
                onRemove={() => updateChild(child.key, null)}
              />
            ) : (
              <div key={child.key} className="rounded-lg border border-border-strong bg-raised px-4 py-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-2">
                    <FieldLabel>Step group</FieldLabel>
                    <GroupRuleFields
                      group={child}
                      onChange={(next) => updateChild(child.key, next)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => updateChild(child.key, null)}
                    aria-label="Remove group"
                    className="text-text-muted transition-colors hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-col gap-2.5">
                  {child.children.map((leaf) =>
                    leaf.kind === 'CONDITION' ? (
                      <ConditionCard
                        key={leaf.key}
                        condition={leaf}
                        parentRule={child.rule}
                        onChange={(next) => updateChild(leaf.key, next)}
                        onRemove={() => updateChild(leaf.key, null)}
                      />
                    ) : null,
                  )}
                  <div>
                    <AddStepMenu onAdd={(type) => addToGroup(child.key, blankCondition(type))} />
                  </div>
                </div>
              </div>
            ),
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AddStepMenu onAdd={(type) => addToGroup(null, blankCondition(type))} />
          <button
            type="button"
            onClick={() => addToGroup(null, blankGroup())}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Add step group
          </button>
        </div>

        {saveErrors.length > 0 ? (
          <div className="rounded-sm border border-border bg-card px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-danger">
              The gate could not be saved
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {saveErrors.map((err, i) => (
                <li key={i} className="text-xs leading-snug text-text-secondary">
                  {err}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={save}
            disabled={saving || stepCount === 0 || !dirty}
            className="rounded-sm bg-primary px-5 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : gateExists ? 'Save gate' : 'Create gate'}
          </button>
          {savedFlash ? (
            <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          ) : dirty && stepCount > 0 ? (
            <span className="text-xs text-text-muted">Unsaved changes</span>
          ) : null}
          {gateExists ? (
            <span className="ml-auto">
              {confirmingDelete ? (
                <span className="inline-flex items-center gap-2 text-xs">
                  <span className="text-text-secondary">Remove this gate?</span>
                  <button type="button" onClick={removeGate} className="font-medium text-danger">
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="text-text-muted"
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="text-xs text-text-muted transition-colors hover:text-danger"
                >
                  Remove gate
                </button>
              )}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Preview + access links ───────────────────────────────────── */}
      <div className="flex flex-col gap-5 lg:sticky lg:top-6">
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-baseline justify-between border-b border-border bg-raised px-4 py-2.5">
            <span className="text-xs font-medium uppercase tracking-widest text-text-secondary">
              Guest preview
            </span>
            {preview && !preview.valid ? (
              <span className="text-xs text-danger">Needs attention</span>
            ) : null}
          </div>
          <div className="bg-bg px-5 py-8">
            {stepCount === 0 ? (
              <p className="text-center text-sm text-text-muted">
                Add a step to see what guests will see.
              </p>
            ) : preview && !preview.valid ? (
              <ul className="flex flex-col gap-1.5">
                {preview.errors.map((err, i) => (
                  <li key={i} className="text-xs leading-snug text-text-secondary">
                    {err}
                  </li>
                ))}
              </ul>
            ) : preview?.view && preview.view.available ? (
              <div className="flex flex-col gap-5">
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
                    Event Access
                  </p>
                  <p className="mt-2 text-2xl italic leading-tight text-text-primary" style={editorial}>
                    {preview.view.headline}
                  </p>
                </div>
                {preview.view.sections.map((section, i) => (
                  <section key={i} className="overflow-hidden rounded-lg border border-border bg-card">
                    <header className="border-b border-border bg-raised px-4 py-2">
                      <span className="text-[10px] font-medium uppercase tracking-widest text-text-secondary">
                        {section.headline}
                      </span>
                    </header>
                    <ul>
                      {section.steps.map((step) => (
                        <li
                          key={step.nodeId}
                          className="flex items-start gap-2.5 border-b border-border px-4 py-3 last:border-b-0"
                        >
                          <span
                            aria-hidden
                            className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-border-strong"
                          />
                          <span className="flex-1 text-xs leading-relaxed text-text-primary">
                            {step.prompt}
                          </span>
                          <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-tertiary">
                            {step.required ? 'Required' : 'To do'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-text-muted">Preview loading…</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-xs font-medium uppercase tracking-widest text-text-secondary">
              Access links
            </span>
            <button
              type="button"
              onClick={mintLink}
              disabled={minting || !gateExists}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-2.5 py-1 text-xs font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              New link
            </button>
          </div>
          {sessions.length === 0 ? (
            <p className="px-4 py-5 text-xs text-text-muted">
              {gateExists
                ? 'No links yet. Mint one and share it - each link tracks its guest’s progress.'
                : 'Save the gate first, then mint shareable links.'}
            </p>
          ) : (
            <ul>
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-text-primary">
                      {session.member ? session.member.name || session.member.email : 'Not yet opened by a guest'}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      {SESSION_STATUS_LABEL[session.status] ?? 'In progress'} ·{' '}
                      {new Date(session.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyLink(session.token)}
                    className="inline-flex items-center gap-1 text-xs text-text-secondary transition-colors hover:text-primary"
                  >
                    {copiedToken === session.token ? (
                      <>
                        <Check className="h-3 w-3" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Copy link
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
