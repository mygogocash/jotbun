// The parser children's self-check (P2b review fixes). The runner starts a
// real child - the same entry, flags and environment as a parse - with
// `sandbox` in place of a format, and this reports what that child could see
// and do: its environment's names, whether a descriptor the runner holds open
// is open here, and whether it can read a file outside its read roots, write
// a file, connect to a loopback port, start a process or a worker, or compile
// code from a string. The runner decides (sandboxVerdict) and parses nothing
// on a runtime where any of these is allowed. Node's permission model denies
// the network only from Node 25 on, so on Node 24 this reports `connected`.
// Runs inside the child: Node built-ins only.
import { spawnSync } from 'node:child_process';
import { fstatSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { Worker } from 'node:worker_threads';

/** What the runner prepared: a loopback port it listens on, a file outside the roots, a path to try writing, and the descriptor's identity. */
type Probe = { port: number; readPath: string; writePath: string; dev: number; ino: number };

const codeOf = (error: unknown): string => (typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : 'error');

function attempt(action: () => void): string {
  try {
    action();
    return 'allowed';
  } catch (error) {
    return codeOf(error);
  }
}

export async function sandboxReport(input: Buffer): Promise<Record<string, unknown>> {
  const probe = JSON.parse(input.toString('utf8')) as Probe;

  const inherited: number[] = [];
  for (let fd = 3; fd < 512; fd += 1) {
    try {
      const stat = fstatSync(fd);
      if (stat.ino === probe.ino && stat.dev === probe.dev) inherited.push(fd);
    } catch {
      // not open
    }
  }

  const net = await new Promise<string>((resolve) => {
    try {
      const socket = connect(probe.port, '127.0.0.1');
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

  const permission = (process as { permission?: { has?: unknown } }).permission;
  return {
    permission: typeof permission?.has === 'function',
    net,
    fsRead: attempt(() => readFileSync(probe.readPath)),
    fsWrite: attempt(() => writeFileSync(probe.writePath, 'x')),
    child,
    worker,
    codegen,
    envKeys: Object.keys(process.env).sort(),
    inherited,
    argv: process.argv.slice(2),
  };
}
