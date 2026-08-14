import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { get } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const port = 5173;
const viteCli = resolve(root, 'node_modules', 'vite', 'bin', 'vite.js');

function request(pathname) {
  return new Promise((resolveRequest) => {
    const httpRequest = get({ host, port, path: pathname, timeout: 900 }, (response) => {
      response.resume();
      resolveRequest({ statusCode: response.statusCode ?? 0, headers: response.headers });
    });
    httpRequest.on('error', () => resolveRequest(null));
    httpRequest.on('timeout', () => {
      httpRequest.destroy();
      resolveRequest(null);
    });
  });
}

async function isReusableViteServer() {
  const client = await request('/@vite/client');
  if (!client || client.statusCode !== 200) return false;
  const entry = await request('/src/main.tsx');
  return Boolean(entry && entry.statusCode === 200);
}

function keepAlive() {
  const timer = setInterval(() => {}, 60_000);
  const stop = () => {
    clearInterval(timer);
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

async function main() {
  if (await isReusableViteServer()) {
    console.log(`[wwcombo] Reusing the existing Vite server at http://${host}:${port}`);
    keepAlive();
    return;
  }

  if (!existsSync(viteCli)) {
    console.error(`[wwcombo] Vite was not found at ${viteCli}`);
    process.exitCode = 1;
    return;
  }

  const vite = spawn(process.execPath, [viteCli, '--host', host, '--port', String(port)], {
    cwd: root,
    env: process.env,
    stdio: 'inherit'
  });
  const forwardSignal = (signal) => vite.kill(signal);
  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));
  vite.once('exit', (code, signal) => {
    process.exitCode = typeof code === 'number' ? code : signal ? 1 : 0;
  });
}

void main();
