"use client";

/** Builder split view (Event Builder Rebuild, Phase B).
 *
 *  Left: the live guest page - the actual anonymous /e/ render in an iframe,
 *  re-keyed after every save so what the operator edits is what the guest
 *  gets. Right: the control rail, progressively disclosed. Core is one
 *  screen (title, date, location, cover, Access); Advanced never blocks
 *  publish. Every mutation goes through lib/builder/actions.ts - the same
 *  layer the AI composer uses.
 *
 *  Copy law: "Access" never "RSVP"; no raw enum values; spaced hyphens.
 *  Design tokens only.
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Plus, Trash2 } from "lucide-react";
import { HeroImageUpload } from "../../_components/HeroImageUpload";
import type { GateNodeSpec } from "@/lib/gate-engine/types";
import {
  createCompCode,
  createDiscountCode,
  deactivateCompCode,
  getBuilderState,
  publishEvent,
  setGateSpec,
  setServiceFee,
  unpublishEvent,
  updateEventDetails,
  type BuilderState,
} from "@/lib/builder/actions";

const editorial = { fontFamily: "'PP Editorial New', Georgia, serif" };

// ── Access draft model (chips-as-a-sentence, depth 2) ───────────────────────

type ChipConfig = Record<string, unknown>;
type Chip = { key: string; conditionType: string; config: ChipConfig };
type ChoiceGroup = { key: string; requiredCount: number; chips: Chip[] };
type AccessDraft = {
  kind: "open" | "gated";
  rootChips: Chip[];
  groups: ChoiceGroup[];
};

let seq = 0;
const nextKey = () => `chip-${++seq}`;

/** Honesty badges: the operator always sees how solid each tumbler is. */
const CATALOG: {
  type: string;
  label: string;
  badge: string;
}[] = [
  { type: "PAY", label: "Buy a ticket", badge: "Verified by Stripe" },
  {
    type: "ANSWER_QUESTIONS",
    label: "Apply to attend",
    badge: "AI-scored - unclear answers go to your review",
  },
  {
    type: "COLLECT_INFO",
    label: "Answer a few questions",
    badge: "Collected for you - no judgment applied",
  },
  {
    type: "HOLD_MEMBERSHIP",
    label: "Active member",
    badge: "Checked live against the member list",
  },
  {
    type: "REFERRED_BY_MEMBER",
    label: "Referred by a member",
    badge: "Checked against the referral on file",
  },
  {
    type: "ATTENDED_PRIOR",
    label: "Attended before",
    badge: "Checked against prior check-ins",
  },
];
const LABEL: Record<string, string> = Object.fromEntries(
  CATALOG.map((c) => [c.type, c.label]),
);
const BADGE: Record<string, string> = Object.fromEntries(
  CATALOG.map((c) => [c.type, c.badge]),
);

function defaultConfig(type: string): ChipConfig {
  if (type === "PAY") return { priceCents: 2500 };
  if (type === "COLLECT_INFO")
    return {
      questions: [
        { id: "q1", label: "Anything we should know?", type: "text", required: false },
      ],
    };
  return {};
}

/** The four templated gates - today's forks reproduced as data. */
const TEMPLATES: { name: string; build: () => AccessDraft }[] = [
  { name: "Open", build: () => ({ kind: "open", rootChips: [], groups: [] }) },
  {
    name: "Paid ticket",
    build: () => ({
      kind: "gated",
      rootChips: [{ key: nextKey(), conditionType: "PAY", config: { priceCents: 2500 } }],
      groups: [],
    }),
  },
  {
    name: "Apply to attend",
    build: () => ({
      kind: "gated",
      rootChips: [{ key: nextKey(), conditionType: "ANSWER_QUESTIONS", config: {} }],
      groups: [],
    }),
  },
  {
    name: "Members + paid",
    build: () => ({
      kind: "gated",
      rootChips: [
        { key: nextKey(), conditionType: "HOLD_MEMBERSHIP", config: {} },
        { key: nextKey(), conditionType: "PAY", config: { priceCents: 2500 } },
      ],
      groups: [],
    }),
  },
];

function draftFromTree(tree: unknown): AccessDraft {
  const root = tree as {
    kind?: string;
    children?: {
      kind: string;
      conditionType: string | null;
      config: unknown;
      rule: string | null;
      requiredCount: number | null;
      children: { kind: string; conditionType: string | null; config: unknown }[];
    }[];
  } | null;
  if (!root || root.kind !== "GROUP") {
    return { kind: "open", rootChips: [], groups: [] };
  }
  const rootChips: Chip[] = [];
  const groups: ChoiceGroup[] = [];
  for (const child of root.children ?? []) {
    if (child.kind === "CONDITION" && child.conditionType) {
      rootChips.push({
        key: nextKey(),
        conditionType: child.conditionType,
        config: (child.config as ChipConfig) ?? {},
      });
    } else if (child.kind === "GROUP") {
      groups.push({
        key: nextKey(),
        requiredCount: child.requiredCount ?? 1,
        chips: (child.children ?? [])
          .filter((c) => c.kind === "CONDITION" && c.conditionType)
          .map((c) => ({
            key: nextKey(),
            conditionType: c.conditionType as string,
            config: (c.config as ChipConfig) ?? {},
          })),
      });
    }
  }
  return { kind: "gated", rootChips, groups };
}

function draftToSpec(draft: AccessDraft): GateNodeSpec | null {
  if (draft.kind === "open") return null;
  const children: GateNodeSpec[] = [
    ...draft.rootChips.map(
      (c): GateNodeSpec => ({
        kind: "CONDITION",
        conditionType: c.conditionType,
        config: c.config,
      }),
    ),
    ...draft.groups
      .filter((g) => g.chips.length > 0)
      .map(
        (g): GateNodeSpec => ({
          kind: "GROUP",
          rule: "ANY_N",
          requiredCount: Math.min(Math.max(1, g.requiredCount), g.chips.length),
          children: g.chips.map((c) => ({
            kind: "CONDITION",
            conditionType: c.conditionType,
            config: c.config,
          })),
        }),
      ),
  ];
  if (children.length === 0) return null;
  return { kind: "GROUP", rule: "ALL", children };
}

/** The sentence the operator is building, in plain English. */
function accessSentence(draft: AccessDraft): string {
  if (draft.kind === "open") return "Open - anyone can get in.";
  const parts: string[] = [
    ...draft.rootChips.map((c) => LABEL[c.conditionType] ?? "Complete a step"),
    ...draft.groups
      .filter((g) => g.chips.length > 0)
      .map(
        (g) =>
          `any ${g.requiredCount === 1 ? "one" : g.requiredCount} of {${g.chips
            .map((c) => LABEL[c.conditionType] ?? "a step")
            .join(", ")}}`,
      ),
  ];
  if (parts.length === 0) return "Open - anyone can get in.";
  return `To get in: ${parts.join(" and ")}.`;
}

// ── Small primitives ─────────────────────────────────────────────────────────

const fieldClass =
  "w-full rounded-sm border border-border bg-card px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary";
const labelClass = "text-xs font-medium text-text-secondary";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function Disclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span className="text-xs font-medium uppercase tracking-widest text-text-secondary">
          {title}
        </span>
        <ChevronDown
          size={14}
          className={`text-text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="pb-5">{children}</div> : null}
    </section>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Chip editors ─────────────────────────────────────────────────────────────

function PayChipEditor({
  config,
  onChange,
}: {
  config: ChipConfig;
  onChange: (config: ChipConfig) => void;
}) {
  const price = typeof config.priceCents === "number" ? config.priceCents : 2500;
  const [priceText, setPriceText] = useState((price / 100).toFixed(2));
  const [more, setMore] = useState(
    Boolean(config.label || config.availableFrom || config.availableUntil || config.maxQuantity),
  );
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-secondary">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={priceText}
          onChange={(e) => {
            setPriceText(e.target.value);
            const cents = Math.round(parseFloat(e.target.value) * 100);
            if (Number.isFinite(cents) && cents >= 0) {
              onChange({ ...config, priceCents: cents });
            }
          }}
          className={`${fieldClass} w-28`}
        />
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          className="text-xs text-text-tertiary underline underline-offset-2"
        >
          {more ? "Fewer options" : "Windows + limits"}
        </button>
      </div>
      {more ? (
        <div className="grid grid-cols-2 gap-2">
          <Row label="Name (Early Bird, GA, Door)">
            <input
              type="text"
              value={(config.label as string) ?? ""}
              maxLength={80}
              onChange={(e) =>
                onChange({ ...config, label: e.target.value || undefined })
              }
              className={fieldClass}
            />
          </Row>
          <Row label="Limit (tickets at this price)">
            <input
              type="number"
              min={1}
              value={(config.maxQuantity as number) ?? ""}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                onChange({
                  ...config,
                  maxQuantity: Number.isFinite(n) && n > 0 ? n : undefined,
                });
              }}
              className={fieldClass}
            />
          </Row>
          <Row label="On sale from">
            <input
              type="datetime-local"
              value={toLocalInput((config.availableFrom as string) ?? null)}
              onChange={(e) =>
                onChange({
                  ...config,
                  availableFrom: fromLocalInput(e.target.value) ?? undefined,
                })
              }
              className={fieldClass}
            />
          </Row>
          <Row label="Until">
            <input
              type="datetime-local"
              value={toLocalInput((config.availableUntil as string) ?? null)}
              onChange={(e) =>
                onChange({
                  ...config,
                  availableUntil: fromLocalInput(e.target.value) ?? undefined,
                })
              }
              className={fieldClass}
            />
          </Row>
        </div>
      ) : null}
    </div>
  );
}

type DraftQuestion = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox";
  required: boolean;
  options?: string[];
};

function QuestionsChipEditor({
  config,
  onChange,
}: {
  config: ChipConfig;
  onChange: (config: ChipConfig) => void;
}) {
  const questions = (config.questions as DraftQuestion[]) ?? [];
  const update = (next: DraftQuestion[]) => onChange({ ...config, questions: next });
  return (
    <div className="mt-2 flex flex-col gap-2">
      {questions.map((q, i) => (
        <div key={q.id} className="flex items-center gap-2">
          <input
            type="text"
            value={q.label}
            maxLength={300}
            placeholder="Question"
            onChange={(e) =>
              update(questions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
            }
            className={`${fieldClass} flex-1`}
          />
          <select
            value={q.type}
            onChange={(e) =>
              update(
                questions.map((x, j) =>
                  j === i ? { ...x, type: e.target.value as DraftQuestion["type"] } : x,
                ),
              )
            }
            className={`${fieldClass} w-28`}
          >
            <option value="text">Short</option>
            <option value="textarea">Long</option>
            <option value="select">Choices</option>
            <option value="checkbox">Yes / no</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={q.required}
              onChange={(e) =>
                update(questions.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))
              }
              className="h-3.5 w-3.5 accent-[var(--primary)]"
            />
            Req.
          </label>
          <button
            type="button"
            onClick={() => update(questions.filter((_, j) => j !== i))}
            className="text-text-tertiary transition-colors hover:text-text-primary"
            aria-label="Remove question"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {questions.some((q) => q.type === "select") ? (
        <p className="text-xs text-text-tertiary">
          Choice questions: separate options with commas below the question.
        </p>
      ) : null}
      {questions.map((q, i) =>
        q.type === "select" ? (
          <input
            key={`${q.id}-options`}
            type="text"
            value={(q.options ?? []).join(", ")}
            placeholder="Option one, option two"
            onChange={(e) =>
              update(
                questions.map((x, j) =>
                  j === i
                    ? {
                        ...x,
                        options: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      }
                    : x,
                ),
              )
            }
            className={fieldClass}
          />
        ) : null,
      )}
      <button
        type="button"
        onClick={() =>
          update([
            ...questions,
            { id: `q${Date.now().toString(36)}`, label: "", type: "text", required: false },
          ])
        }
        className="flex items-center gap-1 self-start text-xs text-text-secondary underline underline-offset-2"
      >
        <Plus size={12} /> Add question
      </button>
    </div>
  );
}

function ChipCard({
  chip,
  onChange,
  onRemove,
  selectable,
  selected,
  onToggleSelect,
}: {
  chip: Chip;
  onChange: (config: ChipConfig) => void;
  onRemove: () => void;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <div
      className={`rounded-sm border p-3 ${selected ? "border-primary bg-raised" : "border-border bg-card"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {selectable ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="h-3.5 w-3.5 accent-[var(--primary)]"
              aria-label="Select step"
            />
          ) : null}
          <span className="text-sm font-medium text-text-primary">
            {LABEL[chip.conditionType] ?? "Step"}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-text-tertiary transition-colors hover:text-text-primary"
          aria-label="Remove step"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <p className="mt-1 text-xs italic text-text-tertiary">
        {BADGE[chip.conditionType]}
      </p>
      {chip.conditionType === "PAY" ? (
        <PayChipEditor config={chip.config} onChange={onChange} />
      ) : null}
      {chip.conditionType === "COLLECT_INFO" ? (
        <QuestionsChipEditor config={chip.config} onChange={onChange} />
      ) : null}
    </div>
  );
}

// ── The shell ────────────────────────────────────────────────────────────────

export function BuilderShell({
  initialState,
  previewUrl,
  composedSummary = null,
}: {
  initialState: BuilderState;
  previewUrl: string;
  composedSummary?: string[] | null;
}) {
  const [showComposed, setShowComposed] = useState(Boolean(composedSummary?.length));
  const [state, setState] = useState(initialState);
  const [draft, setDraft] = useState<AccessDraft>(() =>
    initialState.gate ? draftFromTree(initialState.gate.tree) : { kind: "open", rootChips: [], groups: [] },
  );
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const [previewVersion, setPreviewVersion] = useState(0);
  const [saving, startSaving] = useTransition();
  const [notice, setNotice] = useState("");
  const [newCode, setNewCode] = useState("");
  const emptyDiscount = {
    code: "",
    discountType: "percent" as "percent" | "flat",
    value: "",
    maxUses: "",
    perCustomer: "",
    from: "",
    until: "",
  };
  const [newDiscount, setNewDiscount] = useState(emptyDiscount);

  const event = state.event;
  const published = event.status === "PUBLISHED";

  const refresh = useCallback(async () => {
    const res = await getBuilderState(event.id);
    if (res.ok) setState(res.state);
    setPreviewVersion((v) => v + 1);
  }, [event.id]);

  const run = useCallback(
    (fn: () => Promise<{ ok: boolean; error?: string }>) => {
      setNotice("");
      startSaving(async () => {
        const res = await fn();
        if (!res.ok) setNotice(res.error ?? "Something went wrong.");
        await refresh();
      });
    },
    [refresh],
  );

  const saveDetails = (patch: Parameters<typeof updateEventDetails>[1]) =>
    run(() => updateEventDetails(event.id, patch));

  const saveAccess = (next: AccessDraft) => {
    setDraft(next);
    setSelectedChips(new Set());
    run(() => setGateSpec(event.id, draftToSpec(next)));
  };

  const addChip = (type: string) =>
    saveAccess({
      ...draft,
      kind: "gated",
      rootChips: [...draft.rootChips, { key: nextKey(), conditionType: type, config: defaultConfig(type) }],
    });

  const groupSelected = () => {
    const picked = draft.rootChips.filter((c) => selectedChips.has(c.key));
    if (picked.length < 2) return;
    saveAccess({
      ...draft,
      rootChips: draft.rootChips.filter((c) => !selectedChips.has(c.key)),
      groups: [...draft.groups, { key: nextKey(), requiredCount: 1, chips: picked }],
    });
  };

  const sentence = useMemo(() => accessSentence(draft), [draft]);

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row lg:overflow-hidden">
      {/* Left: the guest's exact page. */}
      <div className="relative border-b border-border bg-card lg:h-dvh lg:w-1/2 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs uppercase tracking-widest text-text-tertiary">
            {published ? "Live page" : "Guest preview - exactly as they will see it"}
          </span>
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-text-secondary underline underline-offset-2"
          >
            Open <ExternalLink size={12} />
          </a>
        </div>
        <iframe
          key={previewVersion}
          src={previewUrl}
          title="Guest page preview"
          className="h-[52vh] w-full bg-bg lg:h-[calc(100dvh-37px)]"
        />
      </div>

      {/* Right: the control rail. */}
      <div className="flex-1 overflow-y-auto px-6 py-6 lg:h-dvh">
        <div className="mx-auto flex max-w-xl flex-col gap-5 pb-24">
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">
                Event builder
              </p>
              <h1 className="mt-1 text-2xl italic text-text-primary" style={editorial}>
                {event.title}
              </h1>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  run(() =>
                    published
                      ? unpublishEvent(event.id)
                      : publishEvent(event.id, { confirm: true }),
                  )
                }
                className={`rounded-sm px-4 py-2 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50 ${
                  published
                    ? "border border-border text-text-primary"
                    : "bg-primary text-on-primary"
                }`}
              >
                {published ? "Unpublish" : "Publish"}
              </button>
              <span className="text-xs text-text-tertiary">
                {published ? `Live at /e/${event.slug}` : "Draft - only you can see it"}
              </span>
            </div>
          </header>

          {showComposed && composedSummary ? (
            <div className="rounded-sm border border-primary bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-widest text-primary">
                  Composed for your review
                </p>
                <button
                  type="button"
                  onClick={() => setShowComposed(false)}
                  className="text-xs text-text-tertiary underline underline-offset-2"
                >
                  Dismiss
                </button>
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {composedSummary.map((line, i) => (
                  <li key={i} className="text-xs leading-relaxed text-text-secondary">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {notice ? (
            <p className="rounded-sm border border-border bg-raised px-3 py-2 text-xs text-text-secondary">
              {notice}
            </p>
          ) : null}

          {/* Core - always visible, one screen. */}
          <section className="flex flex-col gap-3">
            <Row label="Title">
              <input
                type="text"
                defaultValue={event.title}
                maxLength={200}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== event.title) saveDetails({ title: v });
                }}
                className={fieldClass}
              />
            </Row>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Starts">
                <input
                  type="datetime-local"
                  defaultValue={toLocalInput(event.startAt)}
                  onBlur={(e) => {
                    const iso = fromLocalInput(e.target.value);
                    if (iso && iso !== event.startAt) saveDetails({ startAt: iso });
                  }}
                  className={fieldClass}
                />
              </Row>
              <Row label="Location">
                <input
                  type="text"
                  defaultValue={event.location ?? ""}
                  maxLength={300}
                  placeholder="Revealed to confirmed guests"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (event.location ?? "")) saveDetails({ location: v || null });
                  }}
                  className={fieldClass}
                />
              </Row>
            </div>
            <Row label="Cover">
              <HeroImageUpload
                value={event.heroImageAssetId ?? ""}
                onChange={(key) => saveDetails({ heroImageAssetId: key || null })}
              />
            </Row>
          </section>

          {/* Access - the gate is the door. */}
          <section className="rounded-sm border border-border bg-card p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-medium uppercase tracking-widest text-text-secondary">
                Access
              </h2>
              {saving ? (
                <span className="text-xs text-text-tertiary">Saving…</span>
              ) : null}
            </div>
            <p className="mt-2 text-sm italic text-text-primary" style={editorial}>
              {sentence}
            </p>
            {draft.kind === "gated" ? (
              <p className="mt-2 text-xs leading-relaxed text-text-tertiary">
                This gate is the whole door - any legacy access settings on
                this event stop applying while it exists.
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-2">
              {draft.rootChips.map((chip) => (
                <ChipCard
                  key={chip.key}
                  chip={chip}
                  selectable={draft.rootChips.length > 1}
                  selected={selectedChips.has(chip.key)}
                  onToggleSelect={() =>
                    setSelectedChips((prev) => {
                      const next = new Set(prev);
                      if (next.has(chip.key)) next.delete(chip.key);
                      else next.add(chip.key);
                      return next;
                    })
                  }
                  onChange={(config) =>
                    saveAccess({
                      ...draft,
                      rootChips: draft.rootChips.map((c) =>
                        c.key === chip.key ? { ...c, config } : c,
                      ),
                    })
                  }
                  onRemove={() =>
                    saveAccess({
                      ...draft,
                      rootChips: draft.rootChips.filter((c) => c.key !== chip.key),
                    })
                  }
                />
              ))}

              {draft.groups.map((group) => (
                <div key={group.key} className="rounded-sm border border-border-strong bg-raised p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-secondary">
                      A choice - guests complete any{" "}
                      <select
                        value={group.requiredCount}
                        onChange={(e) =>
                          saveAccess({
                            ...draft,
                            groups: draft.groups.map((g) =>
                              g.key === group.key
                                ? { ...g, requiredCount: parseInt(e.target.value, 10) }
                                : g,
                            ),
                          })
                        }
                        className="mx-1 rounded-sm border border-border bg-card px-1 py-0.5 text-xs"
                      >
                        {group.chips.map((_, i) => (
                          <option key={i} value={i + 1}>
                            {i + 1}
                          </option>
                        ))}
                      </select>{" "}
                      of these
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        saveAccess({
                          ...draft,
                          rootChips: [...draft.rootChips, ...group.chips],
                          groups: draft.groups.filter((g) => g.key !== group.key),
                        })
                      }
                      className="text-xs text-text-tertiary underline underline-offset-2"
                    >
                      Ungroup
                    </button>
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    {group.chips.map((chip) => (
                      <ChipCard
                        key={chip.key}
                        chip={chip}
                        selectable={false}
                        selected={false}
                        onToggleSelect={() => {}}
                        onChange={(config) =>
                          saveAccess({
                            ...draft,
                            groups: draft.groups.map((g) =>
                              g.key === group.key
                                ? {
                                    ...g,
                                    chips: g.chips.map((c) =>
                                      c.key === chip.key ? { ...c, config } : c,
                                    ),
                                  }
                                : g,
                            ),
                          })
                        }
                        onRemove={() =>
                          saveAccess({
                            ...draft,
                            groups: draft.groups
                              .map((g) =>
                                g.key === group.key
                                  ? { ...g, chips: g.chips.filter((c) => c.key !== chip.key) }
                                  : g,
                              )
                              .filter((g) => g.chips.length > 0),
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs font-medium text-text-primary">
                  <Plus size={12} /> Add requirement
                </summary>
                <div className="absolute z-10 mt-1 w-64 rounded-sm border border-border bg-card p-1 shadow-sm">
                  {CATALOG.map((c) => (
                    <button
                      key={c.type}
                      type="button"
                      onClick={(e) => {
                        addChip(c.type);
                        (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                      }}
                      className="block w-full rounded-sm px-2 py-1.5 text-left text-xs text-text-primary hover:bg-raised"
                    >
                      <span className="font-medium">{c.label}</span>
                      <span className="block italic text-text-tertiary">{c.badge}</span>
                    </button>
                  ))}
                </div>
              </details>
              {selectedChips.size >= 2 ? (
                <button
                  type="button"
                  onClick={groupSelected}
                  className="rounded-sm border border-primary px-3 py-1.5 text-xs font-medium text-primary"
                >
                  Make these a choice
                </button>
              ) : null}
              {draft.kind === "gated" ? (
                <button
                  type="button"
                  onClick={() => saveAccess({ kind: "open", rootChips: [], groups: [] })}
                  className="text-xs text-text-tertiary underline underline-offset-2"
                >
                  Reset to Open
                </button>
              ) : null}
              <div className="ml-auto flex gap-1">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => saveAccess(t.build())}
                    className="rounded-sm border border-border px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Advanced - revealed on demand, never blocks publish. */}
          <Disclosure title="Capacity">
            <div className="grid grid-cols-2 items-end gap-3">
              <Row label="Capacity (blank = unlimited)">
                <input
                  type="number"
                  min={1}
                  defaultValue={event.capacity ?? ""}
                  onBlur={(e) => {
                    const n = parseInt(e.target.value, 10);
                    const next = Number.isFinite(n) && n > 0 ? n : null;
                    if (next !== event.capacity) saveDetails({ capacity: next });
                  }}
                  className={fieldClass}
                />
              </Row>
              <label className="flex items-center gap-2 pb-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  defaultChecked={event.showCapacity}
                  onChange={(e) => saveDetails({ showCapacity: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[var(--primary)]"
                />
                Show remaining spots to guests
              </label>
            </div>
          </Disclosure>

          <Disclosure title="Service fee">
            <div className="flex flex-col gap-2">
              {(
                [
                  ["absorb", "We absorb card costs - guests pay the flat price"],
                  ["pass_stripe_only", "Guests cover the card fee - we net the full ticket price"],
                  ["flat_per_ticket", "Add a flat service fee per ticket"],
                ] as const
              ).map(([mode, label]) => (
                <label key={mode} className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="radio"
                    name="fee-mode"
                    checked={event.serviceFeeMode === mode}
                    onChange={() =>
                      run(() =>
                        setServiceFee(event.id, {
                          mode,
                          flatCents: mode === "flat_per_ticket" ? (event.serviceFeeFlatCents ?? 200) : null,
                          percentBps: null,
                        }),
                      )
                    }
                    className="h-3.5 w-3.5 accent-[var(--primary)]"
                  />
                  {label}
                </label>
              ))}
              {event.serviceFeeMode === "flat_per_ticket" ? (
                <Row label="Flat fee (cents)">
                  <input
                    type="number"
                    min={0}
                    defaultValue={event.serviceFeeFlatCents ?? 200}
                    onBlur={(e) => {
                      const n = parseInt(e.target.value, 10);
                      run(() =>
                        setServiceFee(event.id, {
                          mode: "flat_per_ticket",
                          flatCents: Number.isFinite(n) && n >= 0 ? n : 0,
                          percentBps: null,
                        }),
                      );
                    }}
                    className={`${fieldClass} w-32`}
                  />
                </Row>
              ) : null}
              <p className="text-xs text-text-tertiary">
                Guests always see the split - Ticket, Service fee, Total. Never
                a silently inflated price.
              </p>
            </div>
          </Disclosure>

          <Disclosure title="Comp + discount codes">
            <div className="flex flex-col gap-2">
              {state.compCodes.length === 0 ? (
                <p className="text-xs text-text-tertiary">
                  A comp code lets someone through the paid step free - they
                  still get a real ticket and appear on the door list.
                </p>
              ) : null}
              {state.compCodes.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-sm border border-border bg-card px-3 py-2"
                >
                  <div>
                    <span className={`text-sm font-medium ${c.active ? "text-text-primary" : "text-text-tertiary line-through"}`}>
                      {c.code}
                    </span>
                    <span className="ml-2 text-xs text-text-tertiary">
                      {c.usedCount} used{c.maxUses ? ` of ${c.maxUses}` : ""}
                    </span>
                  </div>
                  {c.active ? (
                    <button
                      type="button"
                      onClick={() => run(() => deactivateCompCode(event.id, c.id))}
                      className="text-xs text-text-tertiary underline underline-offset-2"
                    >
                      Deactivate
                    </button>
                  ) : null}
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="HOUSELIST"
                  maxLength={40}
                  className={`${fieldClass} w-44 uppercase`}
                />
                <button
                  type="button"
                  disabled={saving || newCode.trim().length < 3}
                  onClick={() => {
                    const code = newCode.trim();
                    setNewCode("");
                    run(() => createCompCode(event.id, { code }));
                  }}
                  className="rounded-sm border border-border px-3 py-2 text-xs font-medium text-text-primary disabled:opacity-50"
                >
                  Create code
                </button>
              </div>

              {/* Discount codes (D6): part of the price off, guest pays the
                  rest through the normal ticket step. */}
              <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
                {state.discountCodes.length === 0 ? (
                  <p className="text-xs text-text-tertiary">
                    A discount code takes part of the price off - the guest
                    pays the rest through the normal ticket step.
                  </p>
                ) : null}
                {state.discountCodes.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-sm border border-border bg-card px-3 py-2"
                  >
                    <div>
                      <span className={`text-sm font-medium ${c.active ? "text-text-primary" : "text-text-tertiary line-through"}`}>
                        {c.code}
                      </span>
                      <span className="ml-2 text-xs text-text-tertiary">
                        {c.discountType === "percent"
                          ? `${c.discountValue}% off`
                          : `$${(c.discountValue / 100).toFixed(2).replace(/\.00$/, "")} off`}
                        {" · "}
                        {c.usedCount} used{c.maxUses ? ` of ${c.maxUses}` : ""}
                        {c.maxUsesPerCustomer ? ` · ${c.maxUsesPerCustomer} per person` : ""}
                      </span>
                    </div>
                    {c.active ? (
                      <button
                        type="button"
                        onClick={() => run(() => deactivateCompCode(event.id, c.id))}
                        className="text-xs text-text-tertiary underline underline-offset-2"
                      >
                        Deactivate
                      </button>
                    ) : null}
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newDiscount.code}
                    onChange={(e) => setNewDiscount({ ...newDiscount, code: e.target.value })}
                    placeholder="SUMMER20"
                    maxLength={40}
                    className={`${fieldClass} w-36 uppercase`}
                  />
                  <select
                    value={newDiscount.discountType}
                    onChange={(e) =>
                      setNewDiscount({
                        ...newDiscount,
                        discountType: e.target.value as "percent" | "flat",
                      })
                    }
                    className={`${fieldClass} w-28`}
                  >
                    <option value="percent">% off</option>
                    <option value="flat">$ off</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={newDiscount.value}
                    onChange={(e) => setNewDiscount({ ...newDiscount, value: e.target.value })}
                    placeholder={newDiscount.discountType === "percent" ? "20" : "15"}
                    className={`${fieldClass} w-20`}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={newDiscount.maxUses}
                    onChange={(e) => setNewDiscount({ ...newDiscount, maxUses: e.target.value })}
                    placeholder="Max uses"
                    className={`${fieldClass} w-24`}
                  />
                  <input
                    type="number"
                    min={1}
                    value={newDiscount.perCustomer}
                    onChange={(e) => setNewDiscount({ ...newDiscount, perCustomer: e.target.value })}
                    placeholder="Per person"
                    className={`${fieldClass} w-24`}
                  />
                  <input
                    type="datetime-local"
                    value={newDiscount.from}
                    onChange={(e) => setNewDiscount({ ...newDiscount, from: e.target.value })}
                    aria-label="Valid from"
                    className={`${fieldClass} w-44`}
                  />
                  <input
                    type="datetime-local"
                    value={newDiscount.until}
                    onChange={(e) => setNewDiscount({ ...newDiscount, until: e.target.value })}
                    aria-label="Valid until"
                    className={`${fieldClass} w-44`}
                  />
                  <button
                    type="button"
                    disabled={
                      saving ||
                      newDiscount.code.trim().length < 3 ||
                      !(Number.parseFloat(newDiscount.value) > 0)
                    }
                    onClick={() => {
                      const draft = newDiscount;
                      setNewDiscount(emptyDiscount);
                      const value =
                        draft.discountType === "percent"
                          ? Math.round(Number.parseFloat(draft.value))
                          : Math.round(Number.parseFloat(draft.value) * 100);
                      run(() =>
                        createDiscountCode(event.id, {
                          code: draft.code.trim(),
                          discountType: draft.discountType,
                          discountValue: Number.isFinite(value) ? value : 0,
                          maxUses: draft.maxUses
                            ? Number.parseInt(draft.maxUses, 10)
                            : null,
                          maxUsesPerCustomer: draft.perCustomer
                            ? Number.parseInt(draft.perCustomer, 10)
                            : null,
                          validFrom: draft.from || null,
                          validUntil: draft.until || null,
                        }),
                      );
                    }}
                    className="rounded-sm border border-border px-3 py-2 text-xs font-medium text-text-primary disabled:opacity-50"
                  >
                    Create discount
                  </button>
                </div>
              </div>
            </div>
          </Disclosure>

          <Disclosure title="Description + template">
            <div className="flex flex-col gap-3">
              <Row label="Description">
                <textarea
                  rows={5}
                  defaultValue={event.description ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (event.description ?? "")) saveDetails({ description: v || null });
                  }}
                  className={fieldClass}
                />
              </Row>
              <Row label="Page template">
                <select
                  defaultValue={event.template}
                  onChange={(e) =>
                    saveDetails({ template: e.target.value as "split" | "editorial" | "minimal" })
                  }
                  className={fieldClass}
                >
                  <option value="split">Split</option>
                  <option value="editorial">Editorial</option>
                  <option value="minimal">Minimal</option>
                </select>
              </Row>
            </div>
          </Disclosure>

          <div className="border-t border-border pt-4 text-xs text-text-tertiary">
            Attendees, applications, and check-in live on the{" "}
            <Link href={`/operator/events/${event.id}`} className="underline underline-offset-2">
              event dashboard
            </Link>
            .
          </div>
        </div>
      </div>
    </div>
  );
}
