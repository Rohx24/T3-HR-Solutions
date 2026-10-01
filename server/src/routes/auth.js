import { Router } from 'express';
import { HttpError } from '../db.js';
import { seed, DEMO_ACCOUNT } from '../seed.js';
import {
  SESSION_COOKIE, clearSessionCookie, createAccount, createSession, destroySession,
  findUserByEmail, findUserByGoogle, hashPassword, linkGoogle, publicUser, readCookie, setSessionCookie,
  userForToken, validateSignup, verifyGoogleCredential, verifyPassword,
} from '../auth.js';
import { rateLimit } from '../ratelimit.js';

const router = Router();
// Shared across all app instances via Redis: per IP, per 15 minutes.
const AUTH_LIMIT = { windowSec: 15 * 60, message: 'Too many attempts. Please wait a few minutes and try again.' };
const signupLimit = rateLimit({ name: 'signup', max: 10, ...AUTH_LIMIT });
const loginLimit = rateLimit({ name: 'login', max: 10, ...AUTH_LIMIT });
const googleLimit = rateLimit({ name: 'google', max: 20, ...AUTH_LIMIT });
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || null;
// Compared against when the email is unknown, so a miss takes as long as a wrong password.
const DUMMY_HASH = await hashPassword('timing-equaliser');

function startSession(req, res, user) {
  setSessionCookie(req, res, createSession(user.id, req.get('user-agent')));
  return { user: publicUser(user) };
}

// What the login screen can offer: Google button (when configured) and the shared demo account.
router.get('/config', (req, res) => {
  res.json({
    google_client_id: GOOGLE_CLIENT_ID,
    demo: DEMO_ACCOUNT ? { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password } : null,
  });
});

router.get('/me', (req, res) => {
  const user = userForToken(readCookie(req, SESSION_COOKIE));
  if (!user) throw new HttpError(401, 'Not signed in');
  res.json({ user: publicUser(user) });
});

router.post('/signup', signupLimit, async (req, res) => {
  const { name, email, password } = validateSignup(req.body);
  const user = createAccount({
    name,
    email,
    passwordHash: await hashPassword(password),
    workspaceName: req.body?.workspace_name,
    seed: req.body?.sample_data === false ? null : seed,
  });
  res.status(201).json(startSession(req, res, user));
});

router.post('/login', loginLimit, async (req, res) => {
  const email = String(req.body?.email ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!email || !password) throw new HttpError(400, 'Enter your email and password');
  const user = findUserByEmail(email);
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user?.password_hash || !ok) throw new HttpError(401, 'Incorrect email or password');
  res.json(startSession(req, res, user));
});

router.post('/google', googleLimit, async (req, res) => {
  const g = await verifyGoogleCredential(req.body?.credential, GOOGLE_CLIENT_ID);
  let user = findUserByGoogle(g.sub);
  if (!user) {
    const existing = findUserByEmail(g.email);
    user = existing
      ? linkGoogle(existing.id, g.sub, g.picture)
      : createAccount({ name: g.name, email: g.email, googleSub: g.sub, avatarUrl: g.picture, seed });
  }
  res.json(startSession(req, res, user));
});

router.post('/logout', (req, res) => {
  destroySession(readCookie(req, SESSION_COOKIE));
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

export default router;
