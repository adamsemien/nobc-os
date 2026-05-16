"use client";

import { EventDraft } from "@/lib/types";
import { gateMeta } from "@/lib/defaults";
import { Card, SectionTitle } from "./ui";

export function validateDraft(draft: EventDraft): string[] {
  const issues: string[] = [];
  if (!draft.name.trim()) issues.push("Add an event name.");
  if (!draft.date) issues.push("Pick a date.");
  if (!draft.startTime) issues.push("Set a start time.");
  if (!draft.location.trim()) issues.push("Add a location.");
  if (draft.guestAccessEnabled && draft.flow.length === 0) issues.push("Add at least one gate to the guest flow.");
  if (draft.flow.some((s) => s.type === "apply") && draft.questions.length === 0) {
    issues.push("Your flow has an Application gate but no registration questions.");
  }
  return issues;
}

function formatDate(iso: string): string {
  if (!iso) return "Date not set";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
}
function formatTime(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function ReviewStep({
  draft,
  published,
}: {
  draft: EventDraft;
  published: boolean;
}) {
  const issues = validateDraft(draft);
  const timeRange = [formatTime(draft.startTime), formatTime(draft.endTime)]
    .filter(Boolean)
    .join(" – ");

  return (
    <div className="space-y-5">
      <SectionTitle sub="Last look before it goes live.">Review &amp; publish</SectionTitle>

      {published && (
        <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-center">
          <p className="font-display text-xl text-gold">✦ Published</p>
          <p className="mt-1 text-sm text-ink">Your event is live and guests can register.</p>
        </div>
      )}

      {!published && issues.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-red-400/90">
            Finish these before publishing
          </p>
          <ul className="space-y-1">
            {issues.map((it, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink">
                <span className="text-red-400/80">·</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* event preview */}
      <Card className="overflow-hidden !p-0">
        <div className="flex h-28 items-center justify-center bg-gradient-to-br from-gold/25 to-panel-2 text-5xl">
          {draft.coverEmoji}
        </div>
        <div className="p-4">
          <h3 className="font-display text-2xl leading-tight">{draft.name || "Untitled Event"}</h3>
          {draft.tagline && <p className="mt-1 text-sm text-muted">{draft.tagline}</p>}
          <div className="mt-3 space-y-1 text-sm text-ink">
            <p>📅 {formatDate(draft.date)}{timeRange && ` · ${timeRange}`}</p>
            <p>📍 {draft.location || "Location not set"}</p>
            <p>👥 {draft.capacity ? `${draft.capacity} guests` : "Unlimited capacity"}</p>
          </div>
        </div>
      </Card>

      {/* guest flow */}
      {draft.guestAccessEnabled && (
        <Card>
          <h3 className="mb-1 font-display text-xl">Guest flow</h3>
          <p className="mb-3 text-sm text-muted">What each guest completes, in order.</p>
          <ol className="space-y-2">
            {draft.flow.map((step, i) => (
              <li key={step.id} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-xs text-gold">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm text-ink">
                    {step.label}
                    {step.type === "pay" && (
                      <span className="text-gold"> — ${step.price || 0}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted">{step.note || gateMeta(step.type).note}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* questions */}
      {draft.guestAccessEnabled && draft.questions.length > 0 && (
        <Card>
          <h3 className="mb-3 font-display text-xl">
            Registration questions ({draft.questions.length})
          </h3>
          <ul className="space-y-1.5">
            {draft.questions.map((q) => (
              <li key={q.id} className="flex items-baseline gap-2 text-sm">
                <span className="text-gold">·</span>
                <span className="text-ink">{q.label || "Untitled question"}</span>
                {q.required && <span className="text-xs text-muted">required</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
