// Runs the Cypress suite in parallel shards against one `vite preview` server.
// Assumes dist/ is already built (`npm run build`).
// Usage: node scripts/e2e-parallel.mjs [--shards N] [--browser firefox|electron] [-- <extra cypress args>]
import { spawn } from 'node:child_process';
import { listSpecs, splitSpecs } from './e2e-shards.mjs';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const own = sep === -1 ? argv : argv.slice(0, sep);
const extra = sep === -1 ? [] : argv.slice(sep + 1);
const opt = (name) => {
  const i = own.indexOf(name);
  return i === -1 ? undefined : own[i + 1];
};
const total = Number(opt('--shards') ?? process.env.E2E_SHARDS ?? 4);
const browser = opt('--browser') ?? 'firefox';
if (!Number.isInteger(total) || total < 1) {
  console.error('invalid shard count');
  process.exit(2);
}
const URL = 'http://localhost:4173';
const shards = splitSpecs(listSpecs(), total).filter((s) => s.specs.length > 0);

/** @type {Set<import('node:child_process').ChildProcess>} */
const children = new Set();
const killAll = () => {
  for (const c of children) {
    try {
      if (c.pid) process.kill(-c.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
};
process.on('exit', killAll);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    killAll();
    process.exit(130);
  });
}

const start = (cmd, args, opts = {}) => {
  // detached => own process group, so killAll reaches grandchildren (cypress, browsers)
  const child = spawn(cmd, args, { detached: true, ...opts });
  children.add(child);
  child.on('close', () => children.delete(child));
  return child;
};

const waitForServer = async (timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(URL)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview server did not come up at ${URL}`);
};

const runShard = (shard, i) =>
  new Promise((resolve) => {
    const t0 = Date.now();
    let out = '';
    const child = start(
      'npx',
      ['cypress', 'run', '--browser', browser, '--spec', shard.specs.join(','), ...extra],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const done = (code) => {
      const seconds = (Date.now() - t0) / 1000;
      console.log(
        `\n${'='.repeat(20)} shard ${i + 1}/${shards.length} (exit ${code}, ${seconds.toFixed(0)}s) ${'='.repeat(20)}`,
      );
      console.log(out);
      resolve({ shard: i + 1, specs: shard.specs, code, seconds });
    };
    child.on('error', () => done(1));
    child.on('close', (code) => done(code ?? 1));
  });

let results = [];
try {
  const preview = start('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
    stdio: 'ignore',
  });
  let previewDied = false;
  preview.on('close', () => (previewDied = true));
  await waitForServer();
  if (previewDied) throw new Error('preview server exited early (port 4173 busy?)');
  results = await Promise.all(shards.map(runShard));
} catch (err) {
  console.error(String(err));
  killAll();
  process.exit(1);
}
killAll();

console.log('\nSummary');
for (const r of results) {
  const names = r.specs.map((p) => p.replace(/^.*\//, '').replace('.cy.ts', '')).join(', ');
  console.log(`  shard ${r.shard}: exit ${r.code}, ${r.seconds.toFixed(0)}s  [${names}]`);
}
process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
