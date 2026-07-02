"use server";

/** The client-callable seam for AI composition (Phase E). Exposes ONLY the
 *  prompt string - the planner port stays server-internal, and every write
 *  inside runs through the STAFF-gated action layer. */
import { composeEventFromPrompt, type ComposeResult } from "./compose";

export async function composeEventAction(prompt: string): Promise<ComposeResult> {
  return composeEventFromPrompt(prompt);
}
