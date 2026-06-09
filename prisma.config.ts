import { config } from 'dotenv';
import path from 'path';
import { defineConfig } from 'prisma/config';

config({ path: '.env.local' });

export default defineConfig({
  schema: path.resolve('prisma/schema.prisma'),
  datasource: {
    // Pooled (PgBouncer) connection — used by the app and read/queries.
    url: process.env.DATABASE_URL!,
    // Unpooled Neon endpoint — `prisma migrate` / `migrate resolve` / DDL run here so
    // schema changes never go through PgBouncer transaction pooling. Set DIRECT_URL in
    // .env.local (see .env.local.example). Falls back to the pooled URL if unset.
    directUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
    // Shadow DB for `prisma migrate diff --from-migrations` (history reconciliation
    // post-check). Point SHADOW_DATABASE_URL at a THROWAWAY postgres (local container or a
    // disposable Neon branch) — NEVER the live DB. Unused at runtime.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
