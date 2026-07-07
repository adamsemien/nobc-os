/** New event (Event Builder Rebuild, Phase B).
 *
 *  The four-step wizard is gone (Operating Doc 4.1: no multi-step wizards).
 *  One interaction: name the evening (or don't) and land in the live builder
 *  with smart defaults everywhere - next Saturday 8pm, split template, Open
 *  access. Everything else is edited on the single live record beside the
 *  true guest preview.
 */
import { redirect } from "next/navigation";
import { OperatorRole } from "@prisma/client";
import { requireRolePage } from "@/lib/operator-role";
import { createEventDraft } from "@/lib/builder/actions";

const editorial = { fontFamily: "'PP Editorial New', Georgia, serif" };

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; title?: string }>;
}) {
  await requireRolePage(OperatorRole.STAFF, "/operator/events");
  const { error, title: retryTitle } = await searchParams;

  async function start(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "").trim();
    const result = await createEventDraft(title ? { title } : {});
    // Failure returns here with the typed title intact — never a silent
    // redirect to the events list that eats the operator's input.
    if (!result.ok)
      redirect(`/operator/events/new?error=1&title=${encodeURIComponent(title)}`);
    redirect(`/operator/events/${result.eventId}/builder`);
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6">
      <form action={start} className="w-full max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">
          New event
        </p>
        <h1
          className="mt-3 text-4xl italic leading-tight text-text-primary"
          style={editorial}
        >
          Name the evening
        </h1>
        <p className="mt-3 text-sm text-text-secondary">
          Everything else has a smart default. You will see the guest page as
          you shape it - publish is a switch, never a wall.
        </p>
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-sm border border-danger/40 bg-danger-soft px-4 py-2 text-sm text-danger"
          >
            Could not create the draft. Try again.
          </p>
        ) : null}
        <input
          type="text"
          name="title"
          placeholder="Untitled evening"
          defaultValue={retryTitle ?? ""}
          maxLength={200}
          autoFocus
          className="mt-8 w-full rounded-sm border border-border bg-card px-4 py-3 text-center text-lg text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
        />
        <button
          type="submit"
          className="mt-4 w-full rounded-sm bg-primary px-4 py-3 text-sm font-medium text-on-primary transition-opacity hover:opacity-90"
        >
          Start building
        </button>
      </form>
    </main>
  );
}
