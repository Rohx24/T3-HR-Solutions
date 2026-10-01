// Shared Redis connection used for the API cache and rate limits.
// Redis is an accelerator, not a dependency: without REDIS_URL, or while Redis is down,
// every request is served straight from SQLite and limits fall back to per-process memory.
import { createClient } from 'redis';

let client = null;
let lastWarn = 0;

export function getRedis() {
  return client?.isReady ? client : null;
}

export function redisStatus() {
  if (!client) return 'disabled';
  return client.isReady ? 'up' : 'down';
}

export function connectRedis(url = process.env.REDIS_URL) {
  if (!url) {
    console.log('Redis: REDIS_URL not set, cache and shared rate limits are off');
    return;
  }
  client = createClient({
    url,
    // Reject commands while disconnected instead of queueing them, so a Redis outage never stalls requests.
    disableOfflineQueue: true,
    socket: { connectTimeout: 2000, reconnectStrategy: (retries) => Math.min(250 * retries, 5000) },
  });
  client.on('ready', () => console.log(`Redis: connected (${url})`));
  client.on('error', (err) => {
    if (Date.now() - lastWarn > 30_000) console.warn(`Redis unavailable (${err.message}); serving without cache`);
    lastWarn = Date.now();
  });
  client.connect().catch(() => {});
}

export async function disconnectRedis() {
  if (client?.isOpen) await client.quit().catch(() => {});
}

// Test hook: inject a fake client with the same small surface (get/set/incr/multi).
export function setRedisClientForTests(fake) {
  client = fake;
}
