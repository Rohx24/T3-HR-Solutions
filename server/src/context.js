// Request-scoped tenant context. requireAuth runs each API request inside runAs({ workspaceId, user }),
// so services read the current workspace from here instead of threading it through every call.
// node:sqlite is synchronous, and AsyncLocalStorage follows awaits, so the context holds for the whole request.
import { AsyncLocalStorage } from 'node:async_hooks';
import { HttpError } from './db.js';

const als = new AsyncLocalStorage();

export function runAs(ctx, fn) {
  return als.run(ctx, fn);
}

export function workspaceId() {
  const id = als.getStore()?.workspaceId;
  if (!id) throw new HttpError(401, 'Sign in to continue');
  return id;
}

export function currentUser() {
  return als.getStore()?.user ?? null;
}

// Express middleware that re-enters the context (needed after stream-based middleware such as multer,
// whose callbacks fire outside the original async scope).
export function bindContext(req, res, next) {
  if (!req.ctx) return next();
  runAs(req.ctx, next);
}
