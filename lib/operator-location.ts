/** Resolves the current operator's city for location-aware features
 *  (time-aware greeting, local weather pill, Austin love letter, etc.).
 *
 *  Priority order:
 *   1. Manual override stored on the operator profile ("your location" setting)
 *   2. The operator's Member record city, if one exists
 *   3. IP-based geolocation via Vercel's geo headers
 *   4. Fallback: Austin
 *
 *  When NoBC sells to other workspaces, every operator gets their own
 *  local context automatically. */

export const DEFAULT_OPERATOR_CITY = 'Austin';

export type OperatorLocationInputs = {
  /** "your location" override from the operator's preferences. */
  override?: string | null;
  /** City on the operator's linked Member record. */
  memberCity?: string | null;
  /** Request headers — used to read Vercel's x-vercel-ip-city. */
  headers?: Headers | null;
};

export function getOperatorCity({ override, memberCity, headers }: OperatorLocationInputs = {}): string {
  const clean = (v: string | null | undefined) => {
    const t = (v ?? '').trim();
    return t.length > 0 ? t : null;
  };

  const fromOverride = clean(override);
  if (fromOverride) return fromOverride;

  const fromMember = clean(memberCity);
  if (fromMember) return fromMember;

  const ipCity = headers ? clean(decodeURIComponent(headers.get('x-vercel-ip-city') ?? '')) : null;
  if (ipCity) return ipCity;

  return DEFAULT_OPERATOR_CITY;
}
