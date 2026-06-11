/**
 * One-off verification for the Producer vendor connector.
 *   Run: `npm run verify:producer`
 *   or:  `npx tsx --env-file=.env.local scripts/verify-producer-connector.ts`
 *
 * Pulls vendors live from Producer's CRM export through our connector, proving the
 * HMAC auth + pagination + mapping work end-to-end. The shared secret is read from
 * the environment and is NEVER printed or logged here.
 *
 * Required env (set before running):
 *   NOBC_OS_WEBHOOK_SECRET   shared secret — same value as set on Producer's side
 *   PRODUCER_CRM_EXPORT_URL  full endpoint, e.g. https://<host>/api/crm-export/vendors
 */
import { producerClientFromEnv, ProducerClientError } from '../lib/connectors/producer/client';
import { vendorToNormalizedContact } from '../lib/connectors/producer/transform';

async function main(): Promise<void> {
  const url = process.env.PRODUCER_CRM_EXPORT_URL;
  const hasSecret = Boolean(process.env.NOBC_OS_WEBHOOK_SECRET);

  if (!url || !hasSecret) {
    console.error('✖ Missing config. Set both before running:');
    console.error('   PRODUCER_CRM_EXPORT_URL  =', url ? '(set)' : '(MISSING)');
    console.error('   NOBC_OS_WEBHOOK_SECRET   =', hasSecret ? '(set)' : '(MISSING)');
    console.error('\n   Tip: npx tsx --env-file=.env.local scripts/verify-producer-connector.ts');
    process.exitCode = 1;
    return;
  }

  // Print the target host/path only — never the secret.
  const target = new URL(url);
  console.log(`→ Pulling vendors from ${target.origin}${target.pathname}`);

  const client = producerClientFromEnv();
  if (!client) {
    console.error('✖ producerClientFromEnv() returned null (config not detected at runtime).');
    process.exitCode = 1;
    return;
  }

  try {
    // Small page size deliberately exercises the cursor pagination path.
    const vendors = await client.fetchAllVendors({ limit: 5 });
    console.log(`✓ Pulled ${vendors.length} vendor(s) across paginated requests.`);

    const contacts = vendors.map((v) => vendorToNormalizedContact(v));
    const withEmail = contacts.filter((c) => c.email).length;
    console.log(`✓ Mapped ${contacts.length} → NormalizedContact (${withEmail} with email).`);

    const sample = contacts[0];
    if (sample) {
      const enrichment = sample.enrichment as Record<string, unknown> | undefined;
      console.log('\nSample mapped contact:');
      console.log({
        source: sample.source,
        externalId: sample.externalId,
        firstName: sample.firstName,
        lastName: sample.lastName,
        email: sample.email,
        roleHint: sample.roleHint,
        company: enrichment?.companyName,
        tags: sample.tags,
      });
    }

    console.log('\n✓ End-to-end pipe verified: HMAC auth + pagination + mapping all work.');
  } catch (err) {
    if (err instanceof ProducerClientError) {
      console.error(`✖ Request failed (HTTP ${err.status}).`);
      if (err.status === 401) {
        console.error(
          '   401 → secret differs between the two sides, the Repl needs a restart to load it,',
        );
        console.error('         or the timestamp is outside the ±300s window.');
      }
      console.error('   Response body:', err.body);
    } else {
      console.error('✖ Unexpected error:', err);
    }
    process.exitCode = 1;
  }
}

void main();
