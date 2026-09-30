import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL_MIGRATOR ??
      'postgresql://crm_migrator:crm_migrator@localhost:5432/crm',
  },
});
