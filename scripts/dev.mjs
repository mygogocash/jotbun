import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const container = 'gogospend-mongo-local';
const children = new Set();
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args[0]} failed.`);
  return result.stdout?.trim();
}
function start(command, args, env = {}) {
  if (stopping) return;
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
  children.add(child);
  child.on('error', () => { console.error(`${command} could not start.`); shutdown(1); });
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!stopping) shutdown(code ?? (signal ? 1 : 0));
  });
}
let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  run('docker', ['info', '--format', '{{.ServerVersion}}'], true);
  const names = run('docker', ['container', 'ls', '-a', '--filter', `name=^/${container}$`, '--format', '{{.Names}}'], true);
  if (!names) {
    run('docker', ['run', '-d', '--name', container, '--label', 'app=gogospend', '--publish', '127.0.0.1:27017:27017', '--mount', 'type=volume,source=gogospend-mongo-local-data,target=/data/db', 'mongo:8.0.34', 'mongod', '--replSet', 'rs0', '--bind_ip_all', '--wiredTigerCacheSizeGB', '0.25']);
  } else {
    const owned = run('docker', ['inspect', '--format', '{{index .Config.Labels "app"}}', container], true);
    const bindings = JSON.parse(run('docker', ['inspect', '--format', '{{json .HostConfig.PortBindings}}', container], true));
    const mongo = bindings?.['27017/tcp'];
    const isolated = Object.keys(bindings ?? {}).length === 1 && mongo?.length === 1 && mongo[0].HostIp === '127.0.0.1' && mongo[0].HostPort === '27017';
    if (owned !== 'gogospend' || !isolated) throw new Error('Existing Mongo container is not an isolated GoGoSpend container on 127.0.0.1:27017.');
    run('docker', ['start', container], true);
  }
  // Retry only readiness, never data writes. Replica-set creation is conditional.
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready && !stopping; attempt++) {
    const result = spawnSync('docker', ['exec', container, 'mongosh', '--quiet', '--eval', 'try { rs.status(); } catch (e) { if (e.code === 94) rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]}); else throw e; } if (!db.hello().isWritablePrimary) quit(2);'], { cwd: root, stdio: 'ignore' });
    ready = result.status === 0;
    if (!ready) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (stopping) throw new Error('Local startup cancelled.');
  if (!ready) throw new Error('Local MongoDB did not become writable.');
  run('npm', ['run', 'build', '-w', 'gogospend-api']);
  start(process.execPath, ['apps/api/dist/main.js'], {
    NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '8090',
    MONGO_URI: 'mongodb://127.0.0.1:27017/gogospend?replicaSet=rs0',
    JWT_SECRET: randomBytes(48).toString('base64url'), INTERNAL_API_KEY: randomBytes(48).toString('base64url'),
    CRON_ENABLED: 'false', SPEND_ALLOWLIST_USER_IDS: '', FIREBASE_PROJECT_ID: '',
    FIREBASE_SECONDARY_PROJECT_ID: '', GOOGLE_APPLICATION_CREDENTIALS: '',
    SALT_EDGE_APP_ID: '', SALT_EDGE_SECRET: '', SALT_EDGE_CALLBACK_PUBLIC_KEY: '',
    LEGAL_API_URL: '', SPEND_WEB_ORIGIN: 'http://localhost:8081', CF_EDGE_SECRET: '',
  });
  start(process.execPath, ['node_modules/expo/bin/cli', 'start', 'apps/app', '--web', '--localhost', '--port', '8081', '--max-workers', '2'], {
    EXPO_PUBLIC_API_URL: 'http://localhost:8090', EXPO_PUBLIC_FRONTEND_URL: 'http://localhost:8081',
  });
} catch (error) {
  if (!stopping) {
    console.error(error instanceof Error ? error.message : 'Local startup failed.');
    shutdown(1);
  }
}
