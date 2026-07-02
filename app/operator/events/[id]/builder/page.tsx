/** The Event Builder (Event Builder Rebuild, Phase B - Locked Decision 1).
 *
 *  One live record, WYSIWYG: the left pane is the TRUE anonymous /e/ render
 *  of this event (draft or published) through the token-gated preview route;
 *  the right rail edits the same record through the typed action layer.
 *  Publish is a switch on a page the operator has already seen.
 */
import { notFound } from "next/navigation";
import { OperatorRole } from "@prisma/client";
import { requireRolePage } from "@/lib/operator-role";
import { getBuilderState, getPreviewToken } from "@/lib/builder/actions";
import { BuilderShell } from "./BuilderShell";

export default async function EventBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ composed?: string }>;
}) {
  await requireRolePage(OperatorRole.STAFF, "/operator/events");
  const { id } = await params;
  const { composed } = await searchParams;

  const [stateRes, previewRes] = await Promise.all([
    getBuilderState(id),
    getPreviewToken(id),
  ]);
  if (!stateRes.ok || !previewRes.ok) notFound();

  // Phase E: the AI composer lands here with its assumption summary.
  let composedSummary: string[] | null = null;
  if (composed) {
    try {
      const parsed = JSON.parse(decodeURIComponent(composed)) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.every((line) => typeof line === "string")
      ) {
        composedSummary = parsed.slice(0, 16);
      }
    } catch {
      composedSummary = null;
    }
  }

  return (
    <BuilderShell
      initialState={stateRes.state}
      previewUrl={previewRes.url}
      composedSummary={composedSummary}
    />
  );
}
