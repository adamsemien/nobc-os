import { config } from 'dotenv';
import path from 'path';
import { defineConfig } from 'prisma/config';

config({ path: '.env.local' });

export default defineConfig({
  schema: path.resolve('prisma/schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
