"use client";

import { EventDraft } from "@/lib/types";
import { Card, SectionTitle, Toggle } from "./ui";
import { FlowBuilder } from "./FlowBuilder";
import { RegistrationFields } from "./RegistrationFields";

export function AccessStep({
  draft,
  update,
}: {
  draft: EventDraft;
  update: (patch: Partial<EventDraft>) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionTitle sub="Decide how guests get in — the gates they pass and what you ask them.">
        Access
      </SectionTitle>

      {/* Host access */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl">Host access</h3>
            <p className="mt-0.5 text-sm text-muted">You and your co-hosts manage the event.</p>
          </div>
          <Toggle
            checked={draft.hostAccessEnabled}
            onChange={(v) => update({ hostAccessEnabled: v })}
            label="Host access"
          />
        </div>
      </Card>

      {/* Guest access */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl">Guest access</h3>
            <p className="mt-0.5 text-sm text-muted">For everyone else.</p>
          </div>
          <Toggle
            checked={draft.guestAccessEnabled}
            onChange={(v) => update({ guestAccessEnabled: v })}
            label="Guest access"
          />
        </div>

        {draft.guestAccessEnabled && (
          <div className="mt-5 space-y-6">
            <FlowBuilder flow={draft.flow} onChange={(flow) => update({ flow })} />
            <div className="border-t border-border pt-5">
              <h4 className="mb-1 font-display text-lg">Registration questions</h4>
              <p className="mb-3 text-sm text-muted">
                Used by any <span className="text-gold">Application</span> gate. Add from the
                bank or write your own.
              </p>
              <RegistrationFields
                questions={draft.questions}
                onChange={(questions) => update({ questions })}
              />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
