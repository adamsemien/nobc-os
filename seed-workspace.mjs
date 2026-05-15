import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const eq = line.indexOf('=');
  if (eq < 1) return;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (k) process.env[k] = v;
});

const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

await db.workspace.upsert({
  where: { slug: 'nobc' },
  create: { name: 'No Bad Company', slug: 'nobc', clerkOrgId: 'org_3DfmrFG9Rbru7GuFVe33dtCiEzK' },
  update: {}
});
console.log('Workspace seeded');
await db.$disconnect();
