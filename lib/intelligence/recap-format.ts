/** Humanizers for sponsor-facing numbers. The recap never shows a bare/raw value. */

export function fmtUsdCents(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

/** Compact money for hero stats: $248k / $1.2M. Rounds to thousands first so boundaries are clean. */
export function fmtUsdCompact(cents: number): string {
  const d = cents / 100;
  const k = Math.round(d / 1000);
  if (k >= 1000) return '$' + (k / 1000).toFixed(k >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (k >= 1) return '$' + k.toLocaleString('en-US') + 'k';
  return '$' + Math.round(d).toLocaleString('en-US');
}

export function fmtPct(frac: number, digits = 0): string {
  return (frac * 100).toFixed(digits).replace(/\.0$/, '') + '%';
}

/** Signed percentage-points for lift figures: +37%, -8%, 0%. `pp` is already in points. */
export function fmtSignedPct(pp: number): string {
  return (pp > 0 ? '+' : '') + pp + '%';
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtMultiple(x: number | null): string {
  return x == null ? '—' : x.toFixed(1).replace(/\.0$/, '') + '×';
}
