"use client";

import { useState } from "react";
import { EventDraft } from "@/lib/types";
import { runDraftAgent } from "@/lib/draftAgent";
import { Button, TextArea } from "./ui";

const EXAMPLES = [
  "A late summer rooftop dinner for 40 founders, next Friday at 7pm. Guests apply and I approve them, then pay $45.",
  "Free Saturday morning run club, this Sunday 9am, capacity 60. People just show up.",
  "Curated networking mixer for designers, June 12 at 6:30pm at The Gallery. $25 a ticket.",
];

export function AgentPanel({
  open,
  onClose,
  initialText,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  initialText: string;
  onApply: (patch: Partial<EventDraft>) => void;
}) {
  const [text, setText] = useState(initialText);
  const [result, setResult] = useState<{ patch: Partial<EventDraft>; notes: string[] } | null>(null);

  if (!open) return null;

  function generate() {
    setResult(runDraftAgent(text));
  }

  function apply() {
    if (result) onApply(result.patch);
    setResult(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden />
      <div className="relative max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border bg-panel px-5 pb-8 pt-3">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong" />
        <div className="mb-1 flex items-center gap-2">
          <span className="text-gold">✦</span>
          <h2 className="font-display text-2xl">Set up with the agent</h2>
        </div>
        <p className="mb-4 text-sm text-muted">
          Describe the event in plain language. The agent fills in every step — details, the
          guest flow, and questions. You just review, approve, and publish.
        </p>

        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="e.g. A late summer rooftop dinner for 40 founders, next Friday at 7pm…"
        />

        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setText(ex)}
              className="rounded-full border border-border px-3 py-1.5 text-left text-xs text-muted hover:border-gold/50 hover:text-ink"
            >
              {ex.length > 42 ? ex.slice(0, 40) + "…" : ex}
            </button>
          ))}
        </div>

        {result && (
          <div className="mt-4 rounded-2xl border border-gold/30 bg-gold/5 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gold">
              Here&apos;s what the agent set up
            </p>
            <ul className="space-y-1.5">
              {result.notes.map((n, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink">
                  <span className="text-gold">·</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          {!result ? (
            <Button onClick={generate} disabled={!text.trim()} className="flex-1">
              ✦ Generate event
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={generate} className="flex-1">
                Regenerate
              </Button>
              <Button onClick={apply} className="flex-1">
                Apply &amp; review →
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
