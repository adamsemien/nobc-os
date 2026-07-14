/** The ONE template interpolator for NoBC OS email.
 *
 *  Extracted verbatim from lib/email.ts (event.reminder editor slice) so the
 *  operator preview and the send path share the exact same functions - the
 *  preview renders precisely what a send would produce. Pure module: no db,
 *  no side effects, safe to import from client components.
 *
 *  Do NOT write a second interpolator. Both sendTemplatedEmail (lib/email.ts)
 *  and the communications preview call these.
 */

export type EmailVariables = Record<string, string | number | null | undefined>;

/** Flatten {member: {firstName: 'X'}} → {'member.firstName': 'X'} so callers can
 *  pass nested objects too. */
export function flatten(obj: Record<string, unknown>, prefix = ''): EmailVariables {
  const out: EmailVariables = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else if (v instanceof Date) {
      out[key] = v.toISOString();
    } else if (v == null) {
      out[key] = '';
    } else {
      out[key] = v as string | number;
    }
  }
  return out;
}

export function interpolate(input: string, vars: EmailVariables): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9._]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}
