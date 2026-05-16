import { EventDraft } from "./types";

const KEY = "nbc.event.draft";

export function loadDraft(): EventDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as EventDraft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: EventDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}
