/** Loads .env.local for DB-backed acceptance tests. Import this FIRST in any
 *  test file that touches lib/db - ESM evaluates imports in declaration
 *  order, so this runs before the Prisma client reads DATABASE_URL. */
import { config } from "dotenv";

config({ path: ".env.local" });
