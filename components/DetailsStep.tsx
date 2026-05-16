"use client";

import { EventDraft } from "@/lib/types";
import { Field, SectionTitle, TextArea, TextInput } from "./ui";

const EMOJIS = ["✦", "🌆", "🍷", "🎶", "🏃", "🎨", "🤝", "🔥", "🌿", "🥂"];

export function DetailsStep({
  draft,
  update,
}: {
  draft: EventDraft;
  update: (patch: Partial<EventDraft>) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionTitle sub="The basics guests see on the event page.">Event details</SectionTitle>

      <Field label="Event name">
        <TextInput
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Late Summer Rooftop Dinner"
        />
      </Field>

      <Field label="Tagline" hint="optional">
        <TextInput
          value={draft.tagline}
          onChange={(e) => update({ tagline: e.target.value })}
          placeholder="One line that sells it"
        />
      </Field>

      <Field label="Date">
        <TextInput
          type="date"
          value={draft.date}
          onChange={(e) => update({ date: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <TextInput
            type="time"
            value={draft.startTime}
            onChange={(e) => update({ startTime: e.target.value })}
          />
        </Field>
        <Field label="Ends" hint="optional">
          <TextInput
            type="time"
            value={draft.endTime}
            onChange={(e) => update({ endTime: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Location">
        <TextInput
          value={draft.location}
          onChange={(e) => update({ location: e.target.value })}
          placeholder="Venue name or address"
        />
      </Field>

      <Field label="Capacity" hint="leave blank for unlimited">
        <TextInput
          type="number"
          inputMode="numeric"
          min={1}
          value={draft.capacity ?? ""}
          onChange={(e) =>
            update({ capacity: e.target.value ? Number(e.target.value) : null })
          }
          placeholder="e.g. 40"
        />
      </Field>

      <Field label="Description">
        <TextArea
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={4}
          placeholder="Tell guests what to expect."
        />
      </Field>

      <Field label="Cover">
        <div className="flex flex-wrap gap-2">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => update({ coverEmoji: e })}
              className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl transition-colors ${
                draft.coverEmoji === e
                  ? "border-gold bg-gold/15"
                  : "border-border bg-panel-2 hover:border-border-strong"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}
