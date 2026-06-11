import { config } from 'dotenv';
import path from 'path';
import { defineConfig } from 'prisma/config';

config({ path: '.env.local' });

export default defineConfig({
  schema: path.resolve('prisma/schema.prisma'),
  datasource: {
    // Prisma CLI connection (`migrate` / `migrate resolve` / `db execute` / `diff`) —
    // NOT the app runtime, which connects via lib/db.ts (PrismaNeon + DATABASE_URL).
    // Use the UNPOOLED Neon endpoint so DDL never goes through PgBouncer transaction
    // pooling; falls back to the pooled URL if DIRECT_URL is unset (see .env.local.example).
    // (Prisma 7's defineConfig datasource has no `directUrl` key — the CLI's `url` IS the
    // direct/migration connection.)
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
    // Shadow DB for `prisma migrate diff --from-migrations` (history reconciliation
    // post-check). Point SHADOW_DATABASE_URL at a THROWAWAY postgres (local container or a
    // disposable Neon branch) — NEVER the live DB. Unused at runtime.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
