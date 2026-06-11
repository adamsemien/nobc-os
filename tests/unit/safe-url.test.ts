import { describe, it, expect } from 'vitest';
import { validateOutboundWebhookUrl } from '@/lib/safe-url';

// SSRF guard for operator-configured outbound webhook URLs (security audit
// INFO). Blocks the direct-IP / metadata / internal-host vectors. This is the
// security boundary, so the rejection cases are the important assertions.

const ok = (u: string) => validateOutboundWebhookUrl(u).ok;

describe('validateOutboundWebhookUrl — allows legitimate provider webhooks', () => {
  it('accepts https public hosts', () => {
    expect(ok('https://hooks.slack.com/services/T000/B000/xxxx')).toBe(true);
    expect(ok('https://discord.com/api/webhooks/123/abc')).toBe(true);
    expect(ok('https://example.com/webhook')).toBe(true);
  });
});

describe('validateOutboundWebhookUrl — blocks SSRF vectors', () => {
  it('rejects non-https', () => {
    expect(ok('http://hooks.slack.com/x')).toBe(false);
    expect(ok('ftp://example.com')).toBe(false);
  });

  it('rejects the cloud metadata endpoint and link-local', () => {
    expect(ok('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(ok('https://169.254.1.1/')).toBe(false);
  });

  it('rejects private IPv4 ranges', () => {
    expect(ok('https://10.0.0.5/hook')).toBe(false);
    expect(ok('https://172.16.0.1/hook')).toBe(false);
    expect(ok('https://172.31.255.255/hook')).toBe(false);
    expect(ok('https://192.168.1.10/hook')).toBe(false);
    expect(ok('https://127.0.0.1/hook')).toBe(false);
    expect(ok('https://100.64.0.1/hook')).toBe(false); // CGNAT
    expect(ok('https://0.0.0.0/hook')).toBe(false);
  });

  it('does NOT over-block a public IPv4 in an adjacent range', () => {
    expect(ok('https://172.32.0.1/hook')).toBe(true); // just outside 172.16/12
    expect(ok('https://8.8.8.8/hook')).toBe(true);
  });

  it('rejects loopback / internal hostnames', () => {
    expect(ok('https://localhost/hook')).toBe(false);
    expect(ok('https://internal/hook')).toBe(false); // single-label
    expect(ok('https://db.internal/hook')).toBe(false);
    expect(ok('https://printer.local/hook')).toBe(false);
  });

  it('rejects private/loopback IPv6 incl. v4-mapped', () => {
    expect(ok('https://[::1]/hook')).toBe(false);
    expect(ok('https://[fc00::1]/hook')).toBe(false);
    expect(ok('https://[fe80::1]/hook')).toBe(false);
    expect(ok('https://[::ffff:169.254.169.254]/hook')).toBe(false);
    expect(ok('https://[::ffff:10.0.0.1]/hook')).toBe(false);
  });

  it('rejects empty / malformed input', () => {
    expect(ok('')).toBe(false);
    expect(ok('not a url')).toBe(false);
  });
});
