// Accounts, password hashing and cookie sessions.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db, tx, now, HttpError } from './db.js';
import { runAs } from './context.js';

const scrypt = promisify(crypto.scrypt);

export const SESSION_COOKIE = 'hr_sid';
const SESSION_DAYS = 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------- passwords (scrypt, per-user salt, constant-time compare) ----------

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored ?? '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// ---------- validation ----------

export function validateSignup({ name, email, password } = {}) {
  const n = String(name ?? '').trim();
  const e = String(email ?? '').trim().toLowerCase();
  const p = String(password ?? '');
  if (n.length < 2 || n.length > 80) throw new HttpError(400, 'Enter your full name');
  if (!EMAIL_RE.test(e)) throw new HttpError(400, 'Enter a valid email address');
  if (p.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (p.length > 200) throw new HttpError(400, 'Password is too long');
  return { name: n, email: e, password: p };
}

// ---------- users ----------

const USER_SELECT = `
  SELECT u.id, u.name, u.email, u.role, u.avatar_url, u.workspace_id, u.password_hash, u.google_sub,
         w.name AS workspace_name
  FROM users u JOIN workspaces w ON w.id = u.workspace_id
`;

export function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatar_url: u.avatar_url ?? null,
    workspace: { id: u.workspace_id, name: u.workspace_name },
  };
}

export const findUserByEmail = (email) => db.prepare(`${USER_SELECT} WHERE u.email = ?`).get(String(email).trim()) ?? null;
export const findUserByGoogle = (sub) => db.prepare(`${USER_SELECT} WHERE u.google_sub = ?`).get(sub) ?? null;
const findUserById = (id) => db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id) ?? null;

// Creates a workspace with this user as its admin. `seed` fills the workspace with sample data.
export function createAccount({ name, email, passwordHash = null, googleSub = null, avatarUrl = null, workspaceName, seed } = {}) {
  if (findUserByEmail(email)) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
  const at = now();
  const user = tx(() => {
    const ws = db.prepare('INSERT INTO workspaces (name, created_at) VALUES (?, ?)')
      .run(String(workspaceName || `${name.split(' ')[0]}'s workspace`).trim().slice(0, 80), at);
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO users (workspace_id, name, email, password_hash, google_sub, avatar_url, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'admin', ?)
    `).run(Number(ws.lastInsertRowid), name, email, passwordHash, googleSub, avatarUrl, at);
    return findUserById(Number(lastInsertRowid));
  });
  if (seed) runAs({ workspaceId: user.workspace_id, user: { id: user.id, name: user.name } }, seed);
  return user;
}

export function linkGoogle(userId, googleSub, avatarUrl) {
  db.prepare('UPDATE users SET google_sub = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?').run(googleSub, avatarUrl, userId);
  return findUserById(userId);
}

// ---------- sessions (random token in an HttpOnly cookie, only its SHA-256 is stored) ----------

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(userId, userAgent = '') {
  const token = crypto.randomBytes(32).toString('base64url');
  const at = new Date();
  const expires = new Date(at.getTime() + SESSION_DAYS * 86_400_000);
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)')
    .run(sha256(token), userId, at.toISOString(), expires.toISOString(), String(userAgent).slice(0, 200));
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(at.toISOString(), userId);
  return { token, expires };
}

export function userForToken(token) {
  if (!token) return null;
  const row = db.prepare(`
    ${USER_SELECT} JOIN sessions s ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(sha256(token), now());
  return row ?? null;
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function setSessionCookie(req, res, { token, expires }) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    expires,
    path: '/',
  });
}

export function clearSessionCookie(req, res) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });
}

// ---------- middleware ----------

// Every /api route after this sees only the signed-in user's workspace.
export function requireAuth(req, res, next) {
  const user = userForToken(readCookie(req, SESSION_COOKIE));
  if (!user) throw new HttpError(401, 'Sign in to continue');
  req.user = user;
  req.ctx = { workspaceId: user.workspace_id, user: { id: user.id, name: user.name } };
  runAs(req.ctx, next);
}

// Verifies a Google Identity Services ID token (the `credential` from the Sign in with Google button).
export async function verifyGoogleCredential(credential, clientId) {
  if (!clientId) throw new HttpError(400, 'Google sign-in is not configured on this server');
  if (!credential) throw new HttpError(400, 'Missing Google credential');
  let payload;
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!r.ok) throw new Error('invalid');
    payload = await r.json();
  } catch {
    throw new HttpError(401, 'Google sign-in failed. Please try again.');
  }
  const issuerOk = ['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss);
  const verified = payload.email_verified === true || payload.email_verified === 'true';
  if (payload.aud !== clientId || !issuerOk || !verified || Number(payload.exp) * 1000 < Date.now()) {
    throw new HttpError(401, 'Google sign-in could not be verified');
  }
  return { sub: payload.sub, email: payload.email.toLowerCase(), name: payload.name || payload.email.split('@')[0], picture: payload.picture ?? null };
}
