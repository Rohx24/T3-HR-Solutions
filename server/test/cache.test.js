import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-int-cache-'));
process.env.DB_PATH = ':memory:';

const { default: express } = await import('express');
const { apiCache, ttlFor } = await import('../src/cache.js');
const { rateLimit } = await import('../src/ratelimit.js');
const { setRedisClientForTests } = await import('../src/redis.js');

// Minimal in-memory stand-in for the node-redis client surface we use.
function fakeRedis() {
  const store = new Map();
  const r = {
    isReady: true,
    store,
    get: async (k) => (store.has(k) ? store.get(k) : null),
    set: async (k, v) => (store.set(k, String(v)), 'OK'),
    incr: async (k) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return n;
    },
    multi() {
      const ops = [];
      const m = {
        incr: (k) => (ops.push(k), m),
        expire: () => m,
        exec: async () => Promise.all(ops.map((k) => r.incr(k))),
      };
      return m;
    },
  };
  return r;
}

let server;
let base;
const calls = { stats: 0 };

before(async () => {
  const app = express();
  app.use(express.json());
  // Stand-in for requireAuth: the workspace comes from a header.
  app.use((req, res, next) => {
    req.user = { id: 1, workspace_id: Number(req.get('x-ws') || 1) };
    next();
  });
  app.use('/api', apiCache);
  app.get('/api/stats', (req, res) => {
    calls.stats += 1;
    res.json({ workspace: req.user.workspace_id, computed: calls.stats });
  });
  app.post('/api/candidates', (req, res) => res.status(201).json({ ok: true }));
  app.post('/api/broken', (req, res) => res.status(400).json({ error: 'nope' }));
  app.get('/api/limited', rateLimit({ name: 'test', max: 2, windowSec: 60 }), (req, res) => res.json({ ok: true }));
  app.use((err, req, res, next) => res.status(err.status ?? 500).json({ error: err.message }));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => server.close());

const get = async (p, ws = 1) => {
  const r = await fetch(base + p, { headers: { 'x-ws': String(ws) } });
  return { status: r.status, cache: r.headers.get('x-cache'), body: await r.json() };
};
const post = (p, ws = 1) => fetch(base + p, { method: 'POST', headers: { 'x-ws': String(ws), 'Content-Type': 'application/json' }, body: '{}' });

test('ttl rules: only listed read routes are cacheable', () => {
  assert.equal(ttlFor('/stats'), 30);
  assert.equal(ttlFor('/meta'), 300);
  assert.equal(ttlFor('/candidates/12'), 30);
  assert.equal(ttlFor('/candidates/12/resume'), null);
  assert.equal(ttlFor('/candidates/export.csv'), null);
  assert.equal(ttlFor('/health'), null);
});

test('without Redis every request bypasses the cache', async () => {
  setRedisClientForTests(null);
  const a = await get('/stats');
  const b = await get('/stats');
  assert.equal(a.cache, 'BYPASS');
  assert.equal(b.body.computed, a.body.computed + 1, 'handler ran both times');
});

test('second read is served from Redis without running the handler', async () => {
  setRedisClientForTests(fakeRedis());
  const first = await get('/stats');
  const second = await get('/stats');
  assert.equal(first.cache, 'MISS');
  assert.equal(second.cache, 'HIT');
  assert.deepEqual(second.body, first.body);
});

test('cache entries never leak across workspaces', async () => {
  setRedisClientForTests(fakeRedis());
  const ws1 = await get('/stats', 1);
  const ws2 = await get('/stats', 2);
  assert.equal(ws2.cache, 'MISS', 'workspace 2 must not get workspace 1’s entry');
  assert.equal(ws1.body.workspace, 1);
  assert.equal(ws2.body.workspace, 2);
});

test('a successful write invalidates that workspace only', async () => {
  setRedisClientForTests(fakeRedis());
  await get('/stats', 1);
  await get('/stats', 2);
  assert.equal((await post('/candidates', 1)).status, 201);
  assert.equal((await get('/stats', 1)).cache, 'MISS', 'workspace 1 re-reads after its write');
  assert.equal((await get('/stats', 2)).cache, 'HIT', 'workspace 2 is unaffected');
});

test('a failed write does not invalidate', async () => {
  setRedisClientForTests(fakeRedis());
  await get('/stats');
  assert.equal((await post('/broken')).status, 400);
  assert.equal((await get('/stats')).cache, 'HIT');
});

test('rate limit returns 429 after the limit (Redis-backed and memory fallback)', async () => {
  for (const client of [fakeRedis(), null]) {
    setRedisClientForTests(client);
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await fetch(`${base}/limited`)).status);
    // Each backend keeps its own counters, so both start from zero for this client.
    assert.deepEqual(statuses.slice(0, 2), [200, 200]);
    assert.equal(statuses[2], 429);
  }
});
