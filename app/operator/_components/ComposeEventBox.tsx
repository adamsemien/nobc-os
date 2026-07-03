"use client";

/** Dashboard prompt box (Event Builder Rebuild, Phase E).
 *
 *  "Saturday dinner at Chateau Chloe, $40, members free, 60 cap, apply or
 *  pay" -> a DRAFT composed through the builder action layer, landing in the
 *  WYSIWYG preview with a summary of what was assumed. The AI never
 *  publishes and never touches live money - the operator reviews first.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { composeEventAction } from "@/lib/builder/compose-action";

export function ComposeEventBox() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function compose() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const result = await composeEventAction(trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const summary = encodeURIComponent(JSON.stringify(result.summary));
      router.push(`/operator/events/${result.eventId}/builder?composed=${summary}`);
    } catch {
      setError("Could not compose that - try rephrasing.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-primary" />
        <h2 className="text-xs font-medium uppercase tracking-widest text-text-secondary">
          Compose an event
        </h2>
      </div>
      <p className="mt-1 text-xs text-text-tertiary">
        Describe it in a sentence - you review the draft before anything goes
        live.
      </p>
      <div className="mt-3 flex items-start gap-2">
        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void compose();
            }
          }}
          placeholder="Saturday dinner at Chateau Chloe, $40, members free, 60 cap, apply or pay"
          maxLength={2000}
          className="min-h-[3.25rem] flex-1 resize-y rounded-sm border border-border bg-raised px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
        />
        <button
          type="button"
          onClick={compose}
          disabled={busy || prompt.trim().length === 0}
          className="rounded-sm bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Composing…" : "Compose"}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-text-secondary">{error}</p>
      ) : null}
    </div>
  );
}
