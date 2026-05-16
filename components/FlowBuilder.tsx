"use client";

import { useState } from "react";
import { FlowStep, GateType } from "@/lib/types";
import { FLOW_TEMPLATES, GATE_LIBRARY, buildFlow, gateMeta, makeGate } from "@/lib/defaults";
import { Button, TextInput } from "./ui";

function GateIcon({ type }: { type: GateType }) {
  const map: Record<GateType, string> = {
    register: "✎",
    apply: "❏",
    approve: "✓",
    pay: "$",
    verify: "⛉",
    custom: "✦",
  };
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gold/40 bg-gold/10 text-sm text-gold">
      {map[type]}
    </span>
  );
}

export function FlowBuilder({
  flow,
  onChange,
}: {
  flow: FlowStep[];
  onChange: (flow: FlowStep[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  function updateStep(id: string, patch: Partial<FlowStep>) {
    onChange(flow.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function changeType(id: string, type: GateType) {
    const meta = gateMeta(type);
    onChange(
      flow.map((s) => (s.id === id ? { ...s, type, label: meta.label, note: meta.note } : s))
    );
  }
  function move(index: number, dir: -1 | 1) {
    const next = [...flow];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  function remove(id: string) {
    onChange(flow.filter((s) => s.id !== id));
  }
  function addGate(type: GateType) {
    onChange([...flow, makeGate(type)]);
    setAdding(false);
  }

  return (
    <div className="space-y-4">
      {/* templates */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
          Start from a template
        </p>
        <div className="flex flex-wrap gap-2">
          {FLOW_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(buildFlow(t.steps))}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-ink hover:border-gold/60 hover:text-gold"
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">The flow</p>
        <button
          type="button"
          onClick={() => onChange(buildFlow(["register"]))}
          className="text-xs uppercase tracking-wider text-muted hover:text-ink"
        >
          ↺ Reset
        </button>
      </div>

      <p className="text-sm text-muted">
        Guests complete these gates in order, top to bottom. A gate is any action — fill out an
        application, get approved, verify, or pay. Drop a <span className="text-gold">Buy ticket</span> step
        wherever it belongs, including after an application.
      </p>

      {/* steps */}
      <div className="space-y-2">
        {flow.map((step, i) => {
          const meta = gateMeta(step.type);
          return (
            <div key={step.id} className="rounded-2xl border border-border bg-panel-2 p-3">
              <div className="flex items-start gap-2.5">
                <div className="flex flex-col items-center pt-0.5">
                  <span className="text-xs text-muted">{i + 1}</span>
                </div>
                <GateIcon type={step.type} />
                <div className="min-w-0 flex-1 space-y-2">
                  <TextInput
                    value={step.label}
                    onChange={(e) => updateStep(step.id, { label: e.target.value })}
                    className="!py-2 text-sm font-medium"
                  />
                  <select
                    value={step.type}
                    onChange={(e) => changeType(step.id, e.target.value as GateType)}
                    className="w-full rounded-lg border border-border bg-panel px-2.5 py-2 text-xs text-muted outline-none focus:border-gold/60"
                  >
                    {GATE_LIBRARY.map((g) => (
                      <option key={g.type} value={g.type}>
                        {g.label} — {g.blurb}
                      </option>
                    ))}
                  </select>

                  {step.type === "pay" && (
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2">
                      <span className="text-sm text-gold">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={step.price || ""}
                        onChange={(e) =>
                          updateStep(step.id, { price: Number(e.target.value) || 0 })
                        }
                        placeholder="0"
                        className="w-full bg-transparent text-sm text-ink outline-none"
                      />
                      <span className="text-xs text-muted">ticket price</span>
                    </div>
                  )}

                  <input
                    value={step.note}
                    onChange={(e) => updateStep(step.id, { note: e.target.value })}
                    placeholder={meta.note}
                    className="w-full bg-transparent text-xs text-muted outline-none placeholder:text-muted/60"
                  />
                </div>
              </div>

              <div className="mt-2 flex items-center justify-end gap-1 border-t border-border pt-2">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-ink disabled:opacity-25"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === flow.length - 1}
                  aria-label="Move down"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-ink disabled:opacity-25"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(step.id)}
                  disabled={flow.length === 1}
                  aria-label="Remove step"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-red-400 disabled:opacity-25"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* add step */}
      {adding ? (
        <div className="rounded-2xl border border-gold/30 bg-panel-2 p-2">
          <p className="px-2 py-1.5 text-xs uppercase tracking-wider text-muted">Add a gate</p>
          {GATE_LIBRARY.map((g) => (
            <button
              key={g.type}
              type="button"
              onClick={() => addGate(g.type)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-panel"
            >
              <GateIcon type={g.type} />
              <span className="min-w-0">
                <span className="block text-sm text-ink">{g.label}</span>
                <span className="block text-xs text-muted">{g.blurb}</span>
              </span>
            </button>
          ))}
          <Button variant="ghost" onClick={() => setAdding(false)} className="w-full">
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)} className="w-full border-dashed">
          + Add a gate
        </Button>
      )}
    </div>
  );
}
