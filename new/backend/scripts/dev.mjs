import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const compiler = require.resolve('typescript/bin/tsc');
const build = spawn(process.execPath, [compiler, '-p', 'tsconfig.build.json'], {
  stdio: 'inherit',
});
build.on('exit', (code) => {
  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  const children = [
    spawn(
      process.execPath,
      [
        compiler,
        '-p',
        'tsconfig.build.json',
        '--watch',
        '--preserveWatchOutput',
      ],
      { stdio: 'inherit' },
    ),
    spawn(process.execPath, ['--watch', 'dist/src/main.js'], {
      stdio: 'inherit',
    }),
  ];
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill('SIGTERM');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  for (const child of children)
    child.on('exit', (childCode) => {
      process.exitCode = childCode ?? 0;
      stop();
    });
});
