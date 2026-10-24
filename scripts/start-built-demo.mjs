import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
if (process.env.NODE_ENV === 'production') throw new Error('Демо запрещено в production');
const child = spawn(process.execPath, ['server/dist/index.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    MOCK_AI: 'true',
    SERVE_WEB: 'true',
    PORT: '8790',
    JWT_SECRET: randomBytes(48).toString('hex'),
  },
});
child.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
