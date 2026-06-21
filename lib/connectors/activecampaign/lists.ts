/** ActiveCampaign import scoping — the deny-by-default list firewall.
 *
 *  Phase-1 import pulls ONLY from the allowlisted relationship lists (~816 NoBC
 *  contacts). The realtor book and the full-database dump must NEVER enter the member
 *  spine, so they are hard-denied: a list is imported only if its name is on
 *  ALLOWED_AC_LISTS *and* not denied by {@link isDeniedListName}. Anything not explicitly
 *  allowed is not imported. */

/** The only AC lists Phase-1 import pulls from. Matched case-insensitively, trimmed. */
export const ALLOWED_AC_LISTS = ['Network', 'Industry Partner', 'Sphere'] as const;

/** Names that must NEVER be imported, even if mistakenly added to an allowlist. The
 *  realtor book + the entire-database dump are explicitly fenced off. */
export const DENIED_AC_LISTS = ['Realtors', 'Entire Database'] as const;

const canon = (name: string): string => name.trim().toLowerCase();
const DENIED = new Set<string>(DENIED_AC_LISTS.map(canon));

/** True if a list name is hard-denied: on the explicit denylist, or realtor-namespaced
 *  (any name containing "realtor"). Belt-and-suspenders for the firewall. */
export function isDeniedListName(name: string): boolean {
  const c = canon(name);
  return DENIED.has(c) || c.includes('realtor');
}

/** Reduce a requested allowlist to the names that may actually be pulled: not denied.
 *  Pure; case-insensitive. */
export function allowedListNames(requested: readonly string[] = ALLOWED_AC_LISTS): string[] {
  return requested.filter((n) => !isDeniedListName(n));
}
