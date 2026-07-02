"use client";

/** Per-step guest actions (Stage 17, M4 bridge).
 *
 *  Rendered only for steps the projector marked actionable. "apply" offers
 *  the application form plus the bridge: the server finds the guest's own
 *  application and checks it - no ids ever pass through the browser.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function StepActions({
  token,
  nodeId,
}: {
  token: string;
  nodeId: string;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function checkApplication() {
    setChecking(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/gate/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_application", nodeId }),
      });
      const body = (await res.json()) as { notice?: string; error?: string };
      if (!res.ok) {
        setNotice(body.error ?? "Something went wrong. Try again in a moment.");
        return;
      }
      if (body.notice) {
        setNotice(body.notice);
        return;
      }
      router.refresh();
    } catch {
      setNotice("Something went wrong. Try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/apply"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-opacity hover:opacity-90"
        >
          Apply to attend
        </a>
        <button
          type="button"
          onClick={checkApplication}
          disabled={checking}
          className="text-xs text-text-secondary underline underline-offset-4 transition-colors hover:text-text-primary disabled:opacity-50"
        >
          {checking ? "Checking…" : "I have applied - check my application"}
        </button>
      </div>
      {notice ? (
        <p className="mt-2 text-xs leading-snug text-text-secondary">{notice}</p>
      ) : null}
    </div>
  );
}
