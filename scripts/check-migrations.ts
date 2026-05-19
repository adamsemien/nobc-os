import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { db } = await import('../lib/db');
  try {
    const rows = await db.$queryRaw<Array<{migration_name: string; finished_at: Date | null}>>`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 20`;
    console.log('APPLIED MIGRATIONS:');
    for (const r of rows) console.log(`  ${r.finished_at ? '✓' : '✗'} ${r.migration_name}`);
  } catch (e: any) {
    console.error('ERR:', e.message);
  }
  process.exit(0);
}
main();
