import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { seedIfEmpty } from './seed.js';
import candidates from './routes/candidates.js';
import jobs from './routes/jobs.js';
import companies from './routes/companies.js';
import applications from './routes/applications.js';
import stats from './routes/stats.js';
import auth from './routes/auth.js';
import workspace from './routes/workspace.js';
import interviews from './routes/interviews.js';
import calls from './routes/calls.js';
import publicRoutes from './routes/public.js';
import { failStaleCalls } from './calls.js';
import { requireAuth } from './auth.js';
import { connectRedis, disconnectRedis, redisStatus } from './redis.js';
import { apiCache } from './cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_DIST = process.env.CLIENT_DIST ?? path.resolve(__dirname, '../../client/dist');
const isProd = process.env.NODE_ENV === 'production';
// Which replica answered (set per container in docker-compose); shown in X-Served-By and /api/health.
const INSTANCE = process.env.INSTANCE_NAME || os.hostname();

connectRedis();

await seedIfEmpty();
failStaleCalls();

const app = express();
app.disable('x-powered-by');
// Behind a reverse proxy (Caddy/Nginx) so req.secure and req.ip reflect the real client: TRUST_PROXY=1.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set('X-Served-By', INSTANCE);
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// In dev the Vite proxy makes this unnecessary, but it lets the frontend call :4000 directly too.
if (!isProd) {
  app.use('/api', (req, res, next) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: process.env.GIT_SHA || 'dev', instance: INSTANCE, cache: redisStatus(), uptime_s: Math.round(process.uptime()) });
});
app.use('/api/auth', auth);
// No login needed: the client interviewer's feedback form.
app.use('/api/public', publicRoutes);
// Everything below requires a session and only sees the signed-in user's workspace.
app.use('/api', requireAuth);
app.use('/api', apiCache);
app.use('/api', stats);
app.use('/api/candidates', candidates);
app.use('/api/jobs', jobs);
app.use('/api/companies', companies);
app.use('/api/applications', applications);
app.use('/api/workspace', workspace);
app.use('/api/interviews', interviews);
app.use('/api/calls', calls);
app.use('/api', (req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` }));

// Production: serve the built React app from the same origin.
if (fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(express.static(CLIENT_DIST));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
} else {
  app.get('/', (req, res) => {
    res.type('html').send('<h1>HR-int API is running</h1><p>Frontend not built yet. Try <a href="/api/stats">/api/stats</a>.</p>');
  });
}

app.use((err, req, res, next) => {
  let status = err.status ?? err.statusCode ?? 500;
  let message = err.message;
  if (err instanceof multer.MulterError) {
    status = 400;
    if (err.code === 'LIMIT_FILE_SIZE') message = 'Resume must be 5 MB or smaller';
  }
  if (status >= 500) {
    console.error(err);
    message = 'Internal server error';
  }
  res.status(status).json({ error: message });
});

const server = app.listen(PORT, () => console.log(`HR-int server (${INSTANCE}) listening on http://localhost:${PORT}`));

// Graceful shutdown so the load balancer can drain this instance during a redeploy.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(async () => {
      await disconnectRedis();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
