"use client";

/** Collect-only registration fields (Event Builder Rebuild, Phase B).
 *
 *  Renders the operator's configured questions for a COLLECT_INFO step and
 *  submits the answers through the existing public submit action. No
 *  judgment, no review state - required answers present means the step
 *  clicks. Answers persist to the proof and, via the commerce bridge, onto
 *  the attendee record the operator reads.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GuestFieldView } from "@/lib/gate-engine/guest-view";

const GENERIC_ERROR = "Something went wrong. Try again in a moment.";

export function AnswerStep({
  token,
  nodeId,
  fields,
}: {
  token: string;
  nodeId: string;
  fields: GuestFieldView[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");

  const set = (id: string, value: string | boolean) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  const missingRequired = fields.some((f) => {
    const v = answers[f.id];
    if (f.type === "checkbox") return f.required && v !== true;
    return f.required && !(typeof v === "string" && v.trim().length > 0);
  });

  async function submit() {
    setSubmitting(true);
    setNotice("");
    try {
      const res = await fetch(`/api/gate/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          nodeId,
          submission: { answers },
        }),
      });
      if (!res.ok) {
        setNotice(GENERIC_ERROR);
        return;
      }
      router.refresh();
    } catch {
      setNotice(GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-sm border border-border bg-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-primary";

  return (
    <div className="mt-3 flex flex-col gap-3">
      {fields.map((f) => (
        <label key={f.id} className="flex flex-col gap-1.5">
          {f.type !== "checkbox" ? (
            <span className="text-xs font-medium text-text-secondary">
              {f.label}
              {f.required ? <span className="text-primary"> *</span> : null}
            </span>
          ) : null}
          {f.type === "textarea" ? (
            <textarea
              rows={3}
              value={(answers[f.id] as string) ?? ""}
              onChange={(e) => set(f.id, e.target.value)}
              className={inputClass}
            />
          ) : f.type === "select" ? (
            <select
              value={(answers[f.id] as string) ?? ""}
              onChange={(e) => set(f.id, e.target.value)}
              className={inputClass}
            >
              <option value="">Choose…</option>
              {(f.options ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : f.type === "checkbox" ? (
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={answers[f.id] === true}
                onChange={(e) => set(f.id, e.target.checked)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              <span className="text-sm text-text-primary">
                {f.label}
                {f.required ? <span className="text-primary"> *</span> : null}
              </span>
            </span>
          ) : (
            <input
              type="text"
              value={(answers[f.id] as string) ?? ""}
              onChange={(e) => set(f.id, e.target.value)}
              className={inputClass}
            />
          )}
        </label>
      ))}
      <button
        type="button"
        onClick={submit}
        disabled={submitting || missingRequired}
        className="self-start rounded-sm bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "One moment…" : "Save answers"}
      </button>
      {notice ? (
        <p className="text-xs leading-snug text-text-secondary">{notice}</p>
      ) : null}
    </div>
  );
}
