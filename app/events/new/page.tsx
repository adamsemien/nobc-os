"use client";

import { useEffect, useState } from "react";
import { EventDraft } from "@/lib/types";
import { newDraft } from "@/lib/defaults";
import { loadDraft, saveDraft } from "@/lib/storage";
import { Stepper, STEP_NAMES } from "@/components/Stepper";
import { DraftStep } from "@/components/DraftStep";
import { DetailsStep } from "@/components/DetailsStep";
import { AccessStep } from "@/components/AccessStep";
import { ReviewStep, validateDraft } from "@/components/ReviewStep";
import { AgentPanel } from "@/components/AgentPanel";
import { Button } from "@/components/ui";

export default function NewEventPage() {
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [step, setStep] = useState(0);
  const [published, setPublished] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);

  useEffect(() => {
    setDraft(loadDraft() ?? newDraft());
  }, []);

  useEffect(() => {
    if (draft) saveDraft(draft);
  }, [draft]);

  if (!draft) return null;

  const update = (patch: Partial<EventDraft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  const applyAgentPatch = (patch: Partial<EventDraft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setStep(3);
  };

  const isLast = step === STEP_NAMES.length - 1;
  const issues = validateDraft(draft);

  function next() {
    if (isLast) {
      if (issues.length === 0) {
        setPublished(true);
        update({ status: "published" });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    setStep((s) => Math.min(s + 1, STEP_NAMES.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md">
      {/* header */}
      <header className="px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg tracking-wide text-gold">NBC</span>
          <span className="text-xs uppercase tracking-widest text-muted">← All events</span>
        </div>
        <h1 className="mt-3 font-display text-4xl">New Event</h1>
        <div className="mt-4">
          <Stepper current={step} onJump={setStep} />
        </div>
      </header>

      {/* step body */}
      <main className="px-5 pb-40 pt-6">
        {step === 0 && (
          <DraftStep
            draft={draft}
            update={update}
            onOpenAgent={() => setAgentOpen(true)}
            onNext={next}
          />
        )}
        {step === 1 && <DetailsStep draft={draft} update={update} />}
        {step === 2 && <AccessStep draft={draft} update={update} />}
        {step === 3 && <ReviewStep draft={draft} published={published} />}
      </main>

      {/* agent FAB */}
      {!agentOpen && (
        <button
          type="button"
          onClick={() => setAgentOpen(true)}
          aria-label="Set up with the agent"
          className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-2xl text-bg shadow-lg shadow-black/50 active:scale-95"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          ✦
        </button>
      )}

      {/* sticky bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex w-full max-w-md items-center gap-3 px-5 py-3">
          {step > 0 ? (
            <Button variant="outline" onClick={back} className="flex-1">
              ← Back
            </Button>
          ) : (
            <div className="flex-1" />
          )}
          <Button
            onClick={next}
            disabled={isLast && (issues.length > 0 || published)}
            className="flex-[1.4]"
          >
            {isLast ? (published ? "Published ✓" : "Publish event") : "Next →"}
          </Button>
        </div>
      </nav>

      <AgentPanel
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        initialText={draft.description}
        onApply={applyAgentPatch}
      />
    </div>
  );
}
