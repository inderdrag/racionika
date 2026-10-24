import { spawn } from 'node:child_process';
if (process.env.NODE_ENV === 'production') throw new Error('Демо запрещено в production');
const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, MOCK_AI: 'true' },
});
child.on('exit', (code) => process.exit(code ?? 1));
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => child.kill(event));
