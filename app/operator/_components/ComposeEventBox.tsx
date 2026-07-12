"use client";

/** Dashboard prompt box - now a thin card around the shared compose flow
 *  (ComposeEventFlow): extract -> gap questions -> plain-English confirm ->
 *  create. Nothing is persisted until the operator confirms; the AI never
 *  publishes and never touches live money. */
import { Sparkles } from "lucide-react";
import { ComposeEventFlow } from "./ComposeEventFlow";

export function ComposeEventBox() {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-primary" />
        <h2 className="text-xs font-medium uppercase tracking-widest text-text-secondary">
          Compose an event
        </h2>
      </div>
      <p className="mt-1 text-xs text-text-tertiary">
        Describe it in a sentence - you confirm everything before the draft is
        created.
      </p>
      <div className="mt-3">
        <ComposeEventFlow />
      </div>
    </div>
  );
}
