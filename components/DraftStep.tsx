"use client";

import { EventDraft } from "@/lib/types";
import { Button, SectionTitle, TextArea } from "./ui";

export function DraftStep({
  draft,
  update,
  onOpenAgent,
  onNext,
}: {
  draft: EventDraft;
  update: (patch: Partial<EventDraft>) => void;
  onOpenAgent: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <SectionTitle sub="Describe your event and the agent fills the form — or start from scratch.">
        Start a draft
      </SectionTitle>

      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gold">
          <span>✦</span> Describe it
        </div>
        <TextArea
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={4}
          placeholder="A late summer rooftop dinner for 40 founders, next Friday at 7pm…"
        />
      </div>

      <Button onClick={onOpenAgent} className="w-full">
        ✦ Generate with agent →
      </Button>

      <button
        type="button"
        onClick={onNext}
        className="flex w-full items-center justify-center gap-1.5 text-sm uppercase tracking-wider text-muted hover:text-ink"
      >
        Start from scratch →
      </button>

      <p className="border-t border-border pt-4 text-center text-xs text-muted">
        The agent can set up the entire event. You only review, approve &amp; publish.
      </p>
    </div>
  );
}
