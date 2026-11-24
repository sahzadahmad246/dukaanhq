import { writeFile } from 'node:fs/promises';
import { createApp } from '../src/app';
import { parseConfig } from '../src/config/config.module';

async function main() {
  const app = await createApp(
    parseConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  );
  try {
    const response = await app.inject('/api/openapi.json');
    if (response.statusCode !== 200)
      throw new Error('OpenAPI generation failed');
    await writeFile(
      '../docs/openapi.json',
      `${JSON.stringify(response.json(), null, 2)}\n`,
    );
  } finally {
    await app.close();
  }
}
void main().catch(() => {
  console.error('OpenAPI generation failed.');
  process.exitCode = 1;
});
