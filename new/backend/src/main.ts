import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createApp } from './app';
import { parseConfig } from './config/config.module';

async function bootstrap() {
  if (existsSync('.env')) loadEnvFile('.env');
  const config = parseConfig(process.env);
  const app = await createApp(config);
  try {
    await app.listen(config.PORT, config.HOST);
  } catch (error) {
    await app.close();
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  // Configuration errors contain field names only. Other errors may contain URLs.
  console.error(
    error instanceof Error && error.message.startsWith('Invalid ')
      ? error.message
      : 'Backend startup failed. Check service configuration.',
  );
  process.exitCode = 1;
});
