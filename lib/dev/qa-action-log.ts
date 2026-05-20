/**
 * Lightweight client-side QA action log. Other components emit
 * `logQAAction(label)` after successful operator actions; the QAMissionPanel
 * subscribes to the resulting CustomEvent and feeds it to the AI judge.
 *
 * Calls no-op when no mission is active, so emit points are cheap and safe
 * to leave in production code (dev-only paths gate them anyway).
 */

export type QAActionType = 'navigate' | 'action';

export interface QAActionEntry {
  timestamp: number;
  type: QAActionType;
  label: string;
  url?: string;
}

declare global {
  interface Window {
    __nobcQAActive?: boolean;
  }
}

export const QA_ACTION_EVENT = 'qa:action';

export function setQAActive(active: boolean): void {
  if (typeof window === 'undefined') return;
  window.__nobcQAActive = active;
}

export function isQAActive(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.__nobcQAActive);
}

/** Emit a QA action. No-op when no mission is running. */
export function logQAAction(label: string): void {
  if (typeof window === 'undefined') return;
  if (!window.__nobcQAActive) return;
  try {
    window.dispatchEvent(
      new CustomEvent<QAActionEntry>(QA_ACTION_EVENT, {
        detail: {
          timestamp: Date.now(),
          type: 'action',
          label: label.slice(0, 140),
        },
      }),
    );
  } catch {}
}
