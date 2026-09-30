import 'reflect-metadata';
import { loadDotEnv } from './config/load-dot-env';
import { createApp } from './create-app';
import { loadEnv } from './config/env';

loadDotEnv();

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await createApp();
  await app.listen(env.API_PORT, env.API_HOST);
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Failed to start API';
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
