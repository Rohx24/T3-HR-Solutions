// Read-through API cache in Redis, shared by every app instance behind the load balancer.
//
// Keys are per workspace, so one tenant can never be served another tenant's cached data:
//   hr:ws:<workspaceId>:v<version>:<url>
// Invalidation bumps that workspace's version on every successful write (POST/PATCH/PUT/DELETE).
// Old entries are simply never read again and expire by TTL. The bump finishes *before* the write's
// response is sent, so the client's follow-up GET can never hit a stale entry, on any instance.
import { getRedis } from './redis.js';

const TTL = Number(process.env.CACHE_TTL_SECONDS ?? 30);

// Cacheable GET routes (paths relative to /api) and their TTL in seconds. Anything not listed
// (auth, health, resume and CSV downloads) is never cached.
const RULES = [
  [/^\/meta$/, 300],
  [/^\/companies$/, 120],
  [/^\/jobs\/\d+\/matches$/, 60],
  [/^\/stats$/, TTL],
  [/^\/candidates$/, TTL],
  [/^\/candidates\/\d+$/, TTL],
  [/^\/jobs$/, TTL],
  [/^\/jobs\/\d+$/, TTL],
  [/^\/interviews$/, TTL],
];

export const ttlFor = (path) => RULES.find(([re]) => re.test(path))?.[1] ?? null;
export const versionKey = (workspaceId) => `hr:ws:${workspaceId}:v`;

const WRITES = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// Mounted after requireAuth, so req.user (and its workspace) is known.
export async function apiCache(req, res, next) {
  const redis = getRedis();
  const ws = req.user?.workspace_id;
  if (!redis || !ws) {
    res.set('X-Cache', 'BYPASS');
    return next();
  }
  if (req.method === 'GET') return readThrough(redis, ws, req, res, next);
  if (WRITES.has(req.method)) invalidateOnSuccess(redis, ws, res);
  next();
}

async function readThrough(redis, ws, req, res, next) {
  const ttl = ttlFor(req.path);
  if (!ttl) return next();
  try {
    const version = (await redis.get(versionKey(ws))) ?? '0';
    const key = `hr:ws:${ws}:v${version}:${req.originalUrl}`;
    const hit = await redis.get(key);
    if (hit !== null) {
      res.set('X-Cache', 'HIT');
      return res.type('application/json').send(hit);
    }
    res.set('X-Cache', 'MISS');
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) redis.set(key, JSON.stringify(body), { EX: ttl }).catch(() => {});
      return json(body);
    };
  } catch {
    res.set('X-Cache', 'BYPASS');
  }
  next();
}

function invalidateOnSuccess(redis, ws, res) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400) return json(body);
    redis
      .incr(versionKey(ws))
      .catch(() => {})
      .finally(() => json(body));
    return res;
  };
}
