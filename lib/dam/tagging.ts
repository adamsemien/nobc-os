/**
 * DAM AI auto-tagging — provider-abstracted image classification.
 *
 * Single entry point: tagImage(url) -> string[]. Provider selected via
 * IMAGE_TAGGING_PROVIDER ('cloudflare' | 'huggingface' | 'openai'); default
 * 'cloudflare' (Workers AI image classification). NEVER throws into the upload
 * path — returns [] and logs on any failure or missing configuration. Tags land
 * in Asset.aiTags, separate from manual Asset.tags.
 */

type TaggingProvider = 'cloudflare' | 'huggingface' | 'openai';

function provider(): TaggingProvider {
  const p = (process.env.IMAGE_TAGGING_PROVIDER ?? 'cloudflare').toLowerCase();
  return p === 'huggingface' || p === 'openai' ? p : 'cloudflare';
}

/**
 * Classify an image (by signed URL) into lowercase scene/object tags.
 * Safe by contract: any error resolves to [] (logged), never thrown.
 */
export async function tagImage(url: string): Promise<string[]> {
  const p = provider();
  try {
    switch (p) {
      case 'cloudflare':
        return dedupe(await tagWithCloudflare(url));
      case 'huggingface':
        return dedupe(await tagWithHuggingface(url));
      case 'openai':
        return dedupe(await tagWithOpenai(url));
    }
  } catch (err) {
    console.error('[dam/tagging] tagImage failed', {
      provider: p,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

async function fetchImageBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch image ${res.status}`);
  return res.arrayBuffer();
}

async function tagWithCloudflare(url: string): Promise<string[]> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_API_TOKEN;
  if (!accountId || !token) {
    console.warn('[dam/tagging] cloudflare provider not configured — returning []');
    return [];
  }
  const model = process.env.CLOUDFLARE_AI_IMAGE_MODEL ?? '@cf/microsoft/resnet-50';
  const bytes = await fetchImageBytes(url);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: bytes,
    },
  );
  if (!res.ok) throw new Error(`cloudflare AI ${res.status}`);
  const json = (await res.json()) as { result?: Array<{ label?: string; score?: number }> };
  return (json.result ?? [])
    .filter((r) => typeof r.label === 'string' && (r.score ?? 0) >= 0.25)
    .slice(0, 8)
    .map((r) => normalizeLabel(r.label as string));
}

// Stubs behind the same signature — implemented in a later phase. The provider
// switch and abstraction are what matter for Phase 1.
async function tagWithHuggingface(_url: string): Promise<string[]> {
  console.warn('[dam/tagging] huggingface provider not implemented — returning []');
  return [];
}

async function tagWithOpenai(_url: string): Promise<string[]> {
  console.warn('[dam/tagging] openai provider not implemented — returning []');
  return [];
}

/** ImageNet labels are often "tabby, tabby cat" — keep the first synonym, lowercased. */
function normalizeLabel(label: string): string {
  return label.split(',')[0].trim().toLowerCase();
}

function dedupe(tags: string[]): string[] {
  return Array.from(new Set(tags.filter((t) => t.length > 0)));
}

const HIGH_ENERGY = [
  'crowd', 'concert', 'dance', 'party', 'nightclub', 'stage', 'performance',
  'celebration', 'fireworks', 'disco',
];
const LOW_ENERGY = [
  'portrait', 'still', 'interior', 'table', 'food', 'plate', 'architecture',
  'landscape', 'seat', 'desk', 'book',
];

/**
 * Infer energy level from scene labels (low | medium | high). Null when there
 * are no tags to reason from. Stored on Asset.energyLevel.
 */
export function inferEnergyLevel(tags: string[]): string | null {
  if (!tags.length) return null;
  const high = tags.some((t) => HIGH_ENERGY.some((h) => t.includes(h)));
  const low = tags.some((t) => LOW_ENERGY.some((l) => t.includes(l)));
  if (high && !low) return 'high';
  if (low && !high) return 'low';
  return 'medium';
}
