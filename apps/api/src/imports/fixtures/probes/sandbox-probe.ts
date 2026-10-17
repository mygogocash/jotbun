// Test probe (parser-runner.spec): launched exactly like a parser child, it
// reports what that child could see and do - its environment, whether a file
// descriptor the parent opened is open here, and whether it can read a file
// outside its directory, connect to a local port, start a process or a worker.
// Runs under Node directly: erasable TypeScript and Node built-ins only.
import { spawnSync } from 'node:child_process';
import { fstatSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { Worker } from 'node:worker_threads';

type Config = { port: number; secretPath: string; dev: number; ino: number };

const codeOf = (error: unknown): string => (typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : 'error');

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const config = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Config;

  const inherited: number[] = [];
  for (let fd = 3; fd < 512; fd += 1) {
    try {
      const stat = fstatSync(fd);
      if (stat.ino === config.ino && stat.dev === config.dev) inherited.push(fd);
    } catch {
      // not open
    }
  }

  let fsRead = 'allowed';
  try {
    readFileSync(config.secretPath);
  } catch (error) {
    fsRead = codeOf(error);
  }

  const net = await new Promise<string>((resolve) => {
    try {
      const socket = connect(config.port, '127.0.0.1');
      socket.on('connect', () => {
        socket.destroy();
        resolve('connected');
      });
      socket.on('error', (error) => resolve(codeOf(error)));
    } catch (error) {
      resolve(codeOf(error));
    }
  });

  let child = 'allowed';
  try {
    const result = spawnSync(process.execPath, ['--version']);
    if (result.error) child = codeOf(result.error);
  } catch (error) {
    child = codeOf(error);
  }

  let worker = 'allowed';
  try {
    const started = new Worker('1', { eval: true });
    await started.terminate();
  } catch (error) {
    worker = codeOf(error);
  }

  let codegen = 'allowed';
  try {
    // eslint-disable-next-line no-new-func
    new Function('return 1')();
  } catch (error) {
    codegen = error instanceof Error ? error.name : 'error';
  }

  process.stdout.write(JSON.stringify({ env: { ...process.env }, argv: process.argv.slice(2), inherited, fsRead, net, child, worker, codegen }));
}

void main();
