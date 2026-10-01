// Fixed-window rate limiter. Counters live in Redis so the limit holds across every app instance;
// if Redis is unavailable it falls back to per-process memory rather than letting everything through.
import { HttpError } from './db.js';
import { getRedis } from './redis.js';

const memory = new Map();

export function rateLimit({ name, max, windowSec, key = (req) => req.ip, message = 'Too many requests. Please wait a moment and try again.' }) {
  return async (req, res, next) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const window = Math.floor(nowSec / windowSec);
    const id = `hr:rl:${name}:${key(req)}:${window}`;

    let count;
    const redis = getRedis();
    if (redis) {
      try {
        const [n] = await redis.multi().incr(id).expire(id, windowSec).exec();
        count = Number(n);
      } catch {
        count = undefined;
      }
    }
    if (count === undefined) {
      count = (memory.get(id) ?? 0) + 1;
      memory.set(id, count);
      if (memory.size > 50_000) memory.clear();
    }

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - count)));
    if (count > max) {
      res.set('Retry-After', String(windowSec - (nowSec % windowSec)));
      throw new HttpError(429, message);
    }
    next();
  };
}
