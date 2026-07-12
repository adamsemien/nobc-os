/** New event (Event Builder Rebuild, Phase B; compose flow added by the
 *  ai-event-creation build).
 *
 *  The four-step wizard is gone (Operating Doc 4.1: no multi-step wizards).
 *  Primary path: describe the evening in plain English - the shared compose
 *  flow extracts it, asks only for missing core fields, and creates nothing
 *  until the operator confirms. Fallback: just name it and land in the live
 *  builder with smart defaults everywhere - next Saturday 8pm, split
 *  template, Open access.
 */
import { redirect } from "next/navigation";
import { OperatorRole } from "@prisma/client";
import { requireRolePage } from "@/lib/operator-role";
import { createEventDraft } from "@/lib/builder/actions";
import { ComposeEventFlow } from "../../_components/ComposeEventFlow";

const editorial = { fontFamily: "'PP Editorial New', Georgia, serif" };

export default async function NewEventPage() {
  await requireRolePage(OperatorRole.STAFF, "/operator/events");

  async function start(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "").trim();
    const result = await createEventDraft(title ? { title } : {});
    if (!result.ok) redirect("/operator/events");
    redirect(`/operator/events/${result.eventId}/builder`);
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">
            New event
          </p>
          <h1
            className="mt-3 text-4xl italic leading-tight text-text-primary"
            style={editorial}
          >
            Describe the evening
          </h1>
          <p className="mt-3 text-sm text-text-secondary">
            One sentence is enough - date, place, price, how people get in.
            You confirm everything before the draft exists.
          </p>
        </div>
        <div className="mt-8">
          <ComposeEventFlow autoFocus />
        </div>
        <div className="mt-10 border-t border-border pt-6 text-center">
          <p className="text-xs uppercase tracking-widest text-text-tertiary">
            Or just name it and go
          </p>
          <form action={start} className="mt-4">
            <input
              type="text"
              name="title"
              placeholder="Untitled evening"
              maxLength={200}
              className="w-full rounded-sm border border-border bg-card px-4 py-3 text-center text-lg text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
            />
            <button
              type="submit"
              className="mt-3 w-full rounded-sm bg-primary px-4 py-3 text-sm font-medium text-on-primary transition-opacity hover:opacity-90"
            >
              Start building
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
