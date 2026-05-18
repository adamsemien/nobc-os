/** Time-aware greeting for the operator dashboard.
 *  Pure function — pass the operator's local hour (0-23) and first name. */
export function operatorGreeting(hour: number, name?: string): string {
  const who = name?.trim() ? `, ${name.trim().toLowerCase()}` : '';
  if (hour >= 5 && hour < 9) return `good morning${who}`;
  if (hour >= 9 && hour < 12) return `morning${who}`;
  if (hour >= 12 && hour < 17) return `afternoon${who}`;
  if (hour >= 17 && hour < 21) return `evening${who}`;
  if (hour >= 21 && hour < 24) return `you're up late${who}`;
  if (hour >= 0 && hour < 3) return `still going?`;
  return `okay, you should sleep.`; // 3am-5am
}
