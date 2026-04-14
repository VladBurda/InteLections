import { spawn } from 'node:child_process';

function run(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  child.on('exit', code => {
    if (code !== 0) {
      console.error(`${name} exited with code ${code}`);
    }
  });

  return child;
}

const api = run('api', 'node', ['backend/server.mjs']);
const web = run('web', 'vite', []);

function shutdown() {
  api.kill();
  web.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
