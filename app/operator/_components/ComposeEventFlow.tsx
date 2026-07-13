"use client";

/** The shared compose flow (ai-event-creation build) - ONE engine, mounted
 *  on every event-authoring surface (dashboard box, /operator/events/new,
 *  the builder's slide-over; Cmd+K routes to events/new).
 *
 *  prompt -> propose (extraction, ZERO writes) -> gap questions for missing
 *  CORE fields only -> plain-English confirm screen -> operator confirms ->
 *  THEN the draft is created. A bad extraction dies on "Start over" without
 *  a row ever existing. Answers are re-extracted server-side (never
 *  client-patched); a field is asked at most once - if it is still unclear
 *  after one answer, the smart default stands, visible on the confirm screen.
 *
 *  Copy law: "Access" never "RSVP"; spaced hyphens, never em dashes; no raw
 *  enum values or spec JSON. Design tokens only.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import {
  confirmComposeAction,
  proposeEventAction,
} from "@/lib/builder/compose-action";
import type {
  Clarification,
  CompositionProposal,
  CoreField,
  CoreGap,
} from "@/lib/builder/compose";

const PLACEHOLDER =
  "Saturday dinner at Chateau Chloe, $40, members free, 60 cap, apply or pay";

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Stage = "input" | "asking" | "confirm";

const WORKING_LINES = [
  "Reading the room.",
  "Setting the door.",
  "Working out who gets in.",
  "Pricing the night.",
  "Putting it together.",
];

/** Shown while a propose is in flight. Mounted only while the propose
 *  promise is pending (busy), so no timer can outlive the request - the
 *  effect cleanup clears the cycle on unmount. Reduced motion holds the
 *  first line: no cycling, no pulse. */
function ComposeWorking() {
  const [line, setLine] = useState(0);
  const [faded, setFaded] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let swap: ReturnType<typeof setTimeout> | undefined;
    const cycle = setInterval(() => {
      setFaded(true);
      swap = setTimeout(() => {
        setLine((i) => (i + 1) % WORKING_LINES.length);
        setFaded(false);
      }, 300);
    }, 1600);
    return () => {
      clearInterval(cycle);
      if (swap) clearTimeout(swap);
    };
  }, []);

  return (
    <div role="status" className="flex items-center gap-2.5 py-3">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
      <p
        className={`text-sm text-text-secondary transition-opacity duration-300 motion-reduce:transition-none ${
          faded ? "opacity-0" : "opacity-100"
        }`}
      >
        {WORKING_LINES[line]}
      </p>
    </div>
  );
}

export function ComposeEventFlow({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("input");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<CompositionProposal | null>(null);
  const [queue, setQueue] = useState<CoreGap[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [answers, setAnswers] = useState<Clarification[]>([]);
  const [asked, setAsked] = useState<CoreField[]>([]);
  const [answerDraft, setAnswerDraft] = useState("");

  function fail(message: string) {
    setError(message || "Could not compose that - try rephrasing.");
  }

  async function propose(clarifications: Clarification[], askedNow: CoreField[]) {
    setBusy(true);
    setError("");
    try {
      const result = await proposeEventAction(prompt.trim(), clarifications);
      if (!result.ok) {
        fail(result.error);
        // No prior proposal - back to input. With one (a round-two failure),
        // fall back to the last good proposal so the error renders beneath
        // it, never a blank screen (the asking stage has an empty queue).
        setStage(proposal ? "confirm" : "input");
        return;
      }
      setProposal(result.proposal);
      // A field is asked at most once across the whole flow.
      const fresh = result.proposal.gaps.filter((g) => !askedNow.includes(g.field));
      if (fresh.length > 0) {
        setQueue(fresh);
        setQueueTotal(fresh.length);
        setAnswerDraft("");
        setStage("asking");
      } else {
        setStage("confirm");
      }
    } catch {
      fail("Could not compose that - try rephrasing.");
      setStage(proposal ? "confirm" : "input");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!prompt.trim()) return;
    setProposal(null);
    setAnswers([]);
    setAsked([]);
    await propose([], []);
  }

  async function answerCurrent(skip: boolean) {
    const current = queue[0];
    if (!current) return;
    const nextAnswers = skip
      ? answers
      : [...answers, { question: current.question, answer: answerDraft.trim() }];
    const nextAsked = [...asked, current.field];
    const rest = queue.slice(1);
    setAnswers(nextAnswers);
    setAsked(nextAsked);
    setQueue(rest);
    setAnswerDraft("");
    if (rest.length > 0) return;
    // Round complete. Answers get re-extracted server-side; all-skips means
    // the current proposal already stands - defaults show on the confirm.
    if (nextAnswers.length > 0) {
      await propose(nextAnswers, nextAsked);
    } else {
      setStage("confirm");
    }
  }

  async function create() {
    if (!proposal) return;
    setBusy(true);
    setError("");
    try {
      const result = await confirmComposeAction({
        plan: proposal.plan,
        endAt: proposal.endAt,
      });
      if (!result.ok) {
        fail(result.error);
        return;
      }
      const summary = encodeURIComponent(JSON.stringify(result.summary));
      router.push(`/operator/events/${result.eventId}/builder?composed=${summary}`);
    } catch {
      fail("Something went wrong creating the draft.");
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setStage("input");
    setProposal(null);
    setQueue([]);
    setAnswers([]);
    setAsked([]);
    setError("");
  }

  // ── Working (a propose is in flight) ───────────────────────────────────
  // Covers BOTH propose await sites: the initial compose (stage "input") and
  // the re-propose after gap answers (stage "asking" with an emptied queue,
  // which would otherwise render blank). Appears when the propose promise
  // starts, clears when it settles - busy is set around that await alone.
  // The confirm screen's create path keeps its own button state.
  if (busy && stage !== "confirm") return <ComposeWorking />;

  // ── Input ──────────────────────────────────────────────────────────────
  if (stage === "input") {
    return (
      <div>
        <div className="flex items-start gap-2">
          <textarea
            rows={2}
            value={prompt}
            autoFocus={autoFocus}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void start();
              }
            }}
            placeholder={PLACEHOLDER}
            maxLength={2000}
            className="min-h-[3.25rem] flex-1 resize-y rounded-sm border border-border bg-raised px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
          />
          <button
            type="button"
            onClick={() => void start()}
            disabled={busy || prompt.trim().length === 0}
            className="rounded-sm bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Composing…" : "Compose"}
          </button>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          You review everything before the draft is created - nothing exists
          until you confirm.
        </p>
        {error ? <p className="mt-2 text-xs text-text-secondary">{error}</p> : null}
      </div>
    );
  }

  // ── Gap questions (core fields only, one at a time) ────────────────────
  if (stage === "asking") {
    const current = queue[0];
    if (!current) return null;
    return (
      <div>
        <p className="text-xs uppercase tracking-widest text-text-tertiary">
          Question {queueTotal - queue.length + 1} of {queueTotal}
        </p>
        <p className="mt-2 text-sm text-text-primary">{current.question}</p>
        <div className="mt-3 flex items-start gap-2">
          <input
            type="text"
            value={answerDraft}
            autoFocus
            onChange={(e) => setAnswerDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && answerDraft.trim()) {
                e.preventDefault();
                void answerCurrent(false);
              }
            }}
            maxLength={500}
            className="flex-1 rounded-sm border border-border bg-raised px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
          />
          <button
            type="button"
            onClick={() => void answerCurrent(false)}
            disabled={busy || !answerDraft.trim()}
            className="rounded-sm bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Working…" : "Next"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void answerCurrent(true)}
          disabled={busy}
          className="mt-2 text-xs text-text-tertiary underline underline-offset-2"
        >
          Skip - use the smart default
        </button>
        {error ? <p className="mt-2 text-xs text-text-secondary">{error}</p> : null}
      </div>
    );
  }

  // ── Confirm (the safety gate - nothing exists until "Create draft") ────
  if (!proposal) return null;
  const { plan, endAt, readout } = proposal;
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-text-tertiary">
        Review before anything is created
      </p>
      <h3 className="mt-2 text-lg text-text-primary">{plan.title}</h3>
      <dl className="mt-3 flex flex-col gap-1.5 text-sm">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-text-tertiary">When</dt>
          <dd className="text-text-primary">
            {plan.startAt
              ? fmtWhen(plan.startAt)
              : "Not set - defaults to next Saturday, 8pm."}
            {endAt ? ` until ${fmtWhen(endAt)}` : ""}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-text-tertiary">Where</dt>
          <dd className="text-text-primary">
            {plan.location ?? "Not set - add it in the builder."}
          </dd>
        </div>
        {plan.capacity ? (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-text-tertiary">Capacity</dt>
            <dd className="text-text-primary">{plan.capacity}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-3 rounded-sm border border-primary bg-raised p-3">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">
          Access
        </p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {readout.map((line, i) => (
            <li key={i} className="text-sm leading-relaxed text-text-primary">
              {line}
            </li>
          ))}
        </ul>
      </div>
      {plan.serviceFeeMode === "pass_stripe_only" ? (
        <p className="mt-2 text-xs text-text-secondary">
          Guests cover the card fee - editable under Service fee.
        </p>
      ) : null}
      {plan.compCode ? (
        <p className="mt-2 text-xs text-text-secondary">
          Comp code {plan.compCode.toUpperCase()} will be created.
        </p>
      ) : null}
      {plan.assumptions.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
          {plan.assumptions.map((line, i) => (
            <li key={i} className="text-xs leading-relaxed text-text-secondary">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles size={12} />
          {busy ? "Creating…" : "Create draft"}
        </button>
        <button
          type="button"
          onClick={startOver}
          disabled={busy}
          className="text-xs text-text-tertiary underline underline-offset-2"
        >
          Start over
        </button>
      </div>
      <p className="mt-3 text-xs text-text-tertiary">
        The draft stays private - nothing is published and no payment is live
        until you flip the switch in the builder.
      </p>
      {error ? <p className="mt-2 text-xs text-text-secondary">{error}</p> : null}
    </div>
  );
}
