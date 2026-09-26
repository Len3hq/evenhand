// Prisma CLI configuration (migrate, generate). Prisma 7 does not read .env by itself:
// load the repo-root .env for local development; in Docker the variables come from compose.
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: new URL('../../.env', import.meta.url).pathname, quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` needs no database, so a missing URL is allowed there.
    url: process.env.DATABASE_URL ?? '',
  },
});
