/** Guest gate walkthrough (Stage 17, M2 guest render).
 *
 *  Token-addressed, anonymous-capable, server-rendered. Renders the
 *  guest-safe projection only - state and prompts, never enum values, never
 *  decline reasons. Payment and application steps render their state here;
 *  their full in-page flows arrive with the M4 cutover (this page never
 *  touches the live purchase or apply surfaces).
 */
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getDefaultRegistry, getGateEngine } from "@/lib/gate-engine";
import {
  guestViewForSession,
  loadGuestGateContext,
} from "@/lib/gate-engine/guest-session";
import type { GuestSectionView, GuestStepView } from "@/lib/gate-engine/guest-view";
import { AnswerStep } from "./_components/AnswerStep";
import { IdentifyForm } from "./_components/IdentifyForm";
import { PayStep } from "./_components/PayStep";
import { StepActions } from "./_components/StepActions";

export const metadata: Metadata = {
  title: "Event Access - No Bad Company",
};

const editorial = { fontFamily: "'PP Editorial New', Georgia, serif" };

function StepRow({
  step,
  token,
  identified,
}: {
  step: GuestStepView;
  token: string;
  identified: boolean;
}) {
  return (
    <li className="border-b border-border px-5 py-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={
            step.state === "complete"
              ? "mt-1 inline-block h-3 w-3 shrink-0 rounded-full bg-primary"
              : step.state === "in_review"
                ? "mt-1 inline-block h-3 w-3 shrink-0 rounded-full bg-warning"
                : "mt-1 inline-block h-3 w-3 shrink-0 rounded-full border border-border-strong bg-transparent"
          }
        />
        <span className="flex-1 text-sm leading-relaxed text-text-primary">
          {step.prompt}
        </span>
        <span className="shrink-0 text-xs uppercase tracking-wide text-text-tertiary">
          {step.state === "complete"
            ? "Done"
            : step.state === "in_review"
              ? "In review"
              : step.required
                ? "Required"
                : "To do"}
        </span>
      </div>
      {identified && step.action === "apply" ? (
        <div className="pl-6">
          <StepActions token={token} nodeId={step.nodeId} />
        </div>
      ) : null}
      {identified && step.action === "pay" ? (
        <div className="pl-6">
          <PayStep token={token} nodeId={step.nodeId} prompt={step.prompt} />
        </div>
      ) : null}
      {identified && step.action === "answer" && step.fields?.length ? (
        <div className="pl-6">
          <AnswerStep token={token} nodeId={step.nodeId} fields={step.fields} />
        </div>
      ) : null}
    </li>
  );
}

function Section({
  section,
  token,
  identified,
}: {
  section: GuestSectionView;
  token: string;
  identified: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex items-baseline justify-between border-b border-border bg-raised px-5 py-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-text-secondary">
          {section.headline}
        </h2>
        {section.satisfied ? (
          <span className="text-xs text-text-tertiary">Done</span>
        ) : null}
      </header>
      <ul>
        {section.steps.map((step) => (
          <StepRow key={step.nodeId} step={step} token={token} identified={identified} />
        ))}
      </ul>
    </section>
  );
}

export default async function GuestGatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const context = await loadGuestGateContext(db, token);
  const view = context
    ? await guestViewForSession(
        { db, engine: getGateEngine(), registry: getDefaultRegistry() },
        context
      )
    : null;

  if (!context || !view || !view.available) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg px-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl italic text-text-primary" style={editorial}>
            Access is not available right now
          </h1>
          <p className="mt-4 text-sm text-text-secondary">
            This link may have expired. Reach out to the person who invited you
            for a fresh one.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg px-6 py-16">
      <div className="mx-auto flex max-w-xl flex-col gap-8">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">
            Event Access
          </p>
          <h1
            className="mt-3 text-4xl italic leading-tight text-text-primary"
            style={editorial}
          >
            {view.headline}
          </h1>
          {view.open ? (
            <p className="mt-4 text-sm text-text-secondary">
              Your access is confirmed. We look forward to hosting you.
            </p>
          ) : null}
        </header>

        {view.needsIdentity ? (
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="mb-4 text-sm text-text-secondary">
              Tell us who you are and we will pick up any steps you have
              already completed.
            </p>
            <IdentifyForm token={token} />
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          {view.sections.map((section, i) => (
            <Section
              key={i}
              section={section}
              token={token}
              identified={!view.needsIdentity}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
