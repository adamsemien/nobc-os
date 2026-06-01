/** Humanizers for sponsor-facing numbers. The recap never shows a bare/raw value. */

export function fmtUsdCents(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

/** Compact money for hero stats: $248k / $1.2M. */
export function fmtUsdCompact(cents: number): string {
  const d = cents / 100;
  if (d >= 1_000_000) return '$' + (d / 1_000_000).toFixed(d >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (d >= 1_000) return '$' + Math.round(d / 1000).toLocaleString('en-US') + 'k';
  return '$' + Math.round(d).toLocaleString('en-US');
}

export function fmtPct(frac: number, digits = 0): string {
  return (frac * 100).toFixed(digits).replace(/\.0$/, '') + '%';
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtMultiple(x: number | null): string {
  return x == null ? '—' : x.toFixed(1).replace(/\.0$/, '') + '×';
}
