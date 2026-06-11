/**
 * Outbound-webhook URL validation (SSRF guard).
 *
 * Operator-configured webhook URLs (e.g. the `slack.webhook` PlatformSetting,
 * POSTed to by lib/comments-notify.ts) are a stored-SSRF surface: an admin —
 * or a compromised admin — could point one at `http://169.254.169.254/...` or
 * an internal service and use the server as a request proxy/probe.
 *
 * This blocks the direct vectors the audit flagged: require https, reject
 * single-label hosts and obvious internal suffixes, and reject IP literals in
 * private / loopback / link-local / CGNAT / metadata ranges (v4 + v6).
 *
 * NOTE: this does NOT resolve DNS, so it does not stop a public hostname that
 * resolves to a private IP (DNS-rebinding). That needs a resolve-time check at
 * fetch and is a deeper follow-up; this closes the literal-IP / metadata path,
 * which is the practical SSRF vector here.
 */

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

const BLOCKED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home.arpa'];

export function validateOutboundWebhookUrl(raw: string): UrlCheck {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'URL is empty' };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'Not a valid URL' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'URL must use https' };
  }

  // URL.hostname keeps IPv6 literals wrapped in brackets — strip them.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return { ok: false, reason: 'URL has no host' };

  if (host === 'localhost' || !host.includes('.')) {
    // single-label hosts (localhost, bare internal names) — unless it's an IP.
    if (!isIpLiteral(host)) return { ok: false, reason: 'Host is not a public domain' };
  }
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: 'Host points at an internal network' };
  }

  if (isIpLiteral(host) && isPrivateIp(host)) {
    return { ok: false, reason: 'URL points at a private or internal address' };
  }

  return { ok: true, url };
}

function isIpLiteral(host: string): boolean {
  return isIpv4(host) || host.includes(':');
}

function isIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  return m.slice(1).every((o) => Number(o) <= 255);
}

/** Private / loopback / link-local / CGNAT / metadata ranges, v4 + v6. */
function isPrivateIp(host: string): boolean {
  if (isIpv4(host)) return isPrivateIpv4(host);

  const h = host.toLowerCase();

  // IPv4-mapped IPv6 — check the embedded v4. The URL parser may keep the
  // dotted form (::ffff:a.b.c.d) or normalize it to hex (::ffff:a9fe:a9fe).
  const mappedDotted = /::ffff:((?:\d{1,3}\.){3}\d{1,3})$/.exec(h);
  if (mappedDotted && isIpv4(mappedDotted[1])) return isPrivateIpv4(mappedDotted[1]);
  const mappedHex = /::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIpv4(v4);
  }

  if (h === '::1' || h === '::') return true; // loopback / unspecified
  if (h.startsWith('fe80') || h.startsWith('fec0')) return true; // link-local / site-local
  // Unique-local fc00::/7 — first byte 0xfc or 0xfd.
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;
  return false;
}

function isPrivateIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 (IETF) + 192.0.2.0/24 (doc)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}
