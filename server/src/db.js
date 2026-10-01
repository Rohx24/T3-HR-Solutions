import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR ?? path.resolve(__dirname, '../data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Schema v2 (multi-tenant): every company, job and candidate belongs to a workspace, and each user logs in
// to one workspace. It lives in a new file (hr.v2.db) so the old single-tenant hr.db is left untouched.
export const db = new DatabaseSync(process.env.DB_PATH ?? path.join(DATA_DIR, 'hr.v2.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS workspaces (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    google_sub    TEXT UNIQUE,
    avatar_url    TEXT,
    role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'recruiter', 'interviewer')),
    created_at    TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    user_agent  TEXT
  );

  CREATE TABLE IF NOT EXISTS companies (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL COLLATE NOCASE,
    industry     TEXT,
    created_at   TEXT NOT NULL,
    UNIQUE (workspace_id, name)
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id    INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    required_skills TEXT NOT NULL DEFAULT '[]',
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id     INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    email            TEXT,
    phone            TEXT,
    location         TEXT,
    years_experience REAL,
    education        TEXT,
    primary_role     TEXT,
    skills           TEXT NOT NULL DEFAULT '[]',
    resume_text      TEXT,
    resume_file      TEXT,
    resume_filename  TEXT,
    times_applied    INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT NOT NULL,
    last_applied_at  TEXT NOT NULL,
    UNIQUE (workspace_id, email)
  );

  CREATE TABLE IF NOT EXISTS applications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    job_id       INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    stage        TEXT NOT NULL DEFAULT 'Applied',
    match_score  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    UNIQUE (candidate_id, job_id)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id   INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
    round          TEXT,
    author         TEXT,
    rating         INTEGER CHECK (rating BETWEEN 1 AND 5),
    body           TEXT NOT NULL,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    type         TEXT NOT NULL,
    message      TEXT NOT NULL,
    actor        TEXT,
    created_at   TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_companies_ws ON companies(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_ws ON jobs(workspace_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_candidates_ws ON candidates(workspace_id, last_applied_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
  CREATE INDEX IF NOT EXISTS idx_notes_candidate ON notes(candidate_id);
  CREATE INDEX IF NOT EXISTS idx_events_candidate ON events(candidate_id, created_at);

  -- Scheduled interviews for an application's round (date/time, who, where) and whether they happened.
  CREATE TABLE IF NOT EXISTS interviews (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id   INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    round            TEXT NOT NULL,
    scheduled_at     TEXT NOT NULL,
    duration_minutes INTEGER,
    interviewer      TEXT,
    location         TEXT,
    status           TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
    completed_at     TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_interviews_app ON interviews(application_id);
  CREATE INDEX IF NOT EXISTS idx_interviews_time ON interviews(scheduled_at);

  -- Phone calls with a candidate: recorded live, uploaded, or typed as notes. The AI turns the
  -- recording into a transcript, a summary and structured details (salary, notice period...).
  CREATE TABLE IF NOT EXISTS calls (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id     INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    application_id   INTEGER REFERENCES applications(id) ON DELETE SET NULL,
    method           TEXT NOT NULL CHECK (method IN ('recorded', 'uploaded', 'typed')),
    audio_file       TEXT,
    audio_name       TEXT,
    duration_seconds INTEGER,
    notes            TEXT,
    transcript       TEXT,
    summary          TEXT,
    insights         TEXT,
    status           TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'failed')),
    error            TEXT,
    recorded_by      TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_calls_candidate ON calls(candidate_id, created_at);

  -- One-time links that let a client's interviewer submit round feedback without an account.
  CREATE TABLE IF NOT EXISTS feedback_links (
    token_hash   TEXT PRIMARY KEY,
    interview_id INTEGER NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    created_by   TEXT,
    created_at   TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    used_at      TEXT
  );
`);

// Additive migrations: add columns to existing databases without touching any data.
for (const [table, column, type] of [
  ['candidates', 'profile', 'TEXT'], // full structured profile from the AI parser (JSON)
  ['candidates', 'parsed_by', 'TEXT'], // "gpt-4o-mini" or "rules"
  ['jobs', 'rounds', 'TEXT'], // JSON list of this job's interview rounds
  ['candidates', 'source', 'TEXT'], // where the candidate came from: Naukri, LinkedIn, Referral...
  ['candidates', 'source_detail', 'TEXT'], // e.g. who referred them
  ['notes', 'decision', 'TEXT'], // round result: Passed / Not passed / On hold
  ['notes', 'evaluator_company', 'TEXT'], // which company's interviewer gave the feedback
  ['notes', 'interview_id', 'INTEGER'],
  ['jobs', 'apply_token', 'TEXT'], // public apply link: /apply/<token>
  ['candidates', 'contact_consent_at', 'TEXT'], // agreed on the apply page to be contacted about jobs
  ['candidates', 'whatsapp_opt_in_at', 'TEXT'], // ticked "contact me on WhatsApp" on the apply page
  ['candidates', 'whatsapp_permission', 'TEXT'], // WhatsApp call permission request: requested | failed
  ['candidates', 'contact_preference', 'TEXT'], // how they asked to be called: whatsapp | phone
  ['calls', 'channel', 'TEXT'], // how the recruiter reached them: phone | whatsapp
  ['calls', 'consent_basis', 'TEXT'], // recording allowed because consent was: prior (on file) | verbal (on the call)
  ['calls', 'consent_heard', 'TEXT'], // AI check of the transcript: agreed | refused | not_discussed
  ['calls', 'audio_deleted_at', 'TEXT'], // recording removed after notes were taken (or after the retention period)
]) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch (err) {
      if (!/duplicate column/i.test(err.message)) throw err; // another replica added it first
    }
  }
}

// Call-recording consent: an append-only log (the latest row per candidate is the current answer) and the
// one-time links candidates use to answer. Only a SHA-256 of each link token is stored.
db.exec(`
  CREATE TABLE IF NOT EXISTS consents (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id   INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    purpose        TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('granted', 'refused')),
    method         TEXT NOT NULL,
    notice_version TEXT,
    recorded_by    TEXT,
    call_id        INTEGER,
    ip             TEXT,
    user_agent     TEXT,
    created_at     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_consents_candidate ON consents(candidate_id, purpose, id);

  CREATE TABLE IF NOT EXISTS consent_links (
    token_hash   TEXT PRIMARY KEY,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    purpose      TEXT NOT NULL,
    created_by   TEXT,
    created_at   TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    answered_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_consent_links_candidate ON consent_links(candidate_id, created_at);
`);

// Every job gets an unguessable apply token; backfill jobs created before apply links existed.
// The IS NULL guard keeps two replicas booting together from overwriting each other's token.
export const newApplyToken = () => crypto.randomBytes(9).toString('base64url');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_apply_token ON jobs(apply_token)');
for (const { id } of db.prepare('SELECT id FROM jobs WHERE apply_token IS NULL').all()) {
  db.prepare('UPDATE jobs SET apply_token = ? WHERE id = ? AND apply_token IS NULL').run(newApplyToken(), id);
}

export const now = () => new Date().toISOString();

// Re-entrant transaction: nested calls join the outer transaction.
let depth = 0;
export function tx(fn) {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth--;
  }
}

export const parseList = (s) => {
  try {
    return JSON.parse(s ?? '[]');
  } catch {
    return [];
  }
};

export const toCandidate = (r) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  phone: r.phone,
  location: r.location,
  years_experience: r.years_experience,
  education: r.education,
  primary_role: r.primary_role,
  skills: parseList(r.skills),
  times_applied: r.times_applied,
  application_count: r.application_count ?? 0,
  source: r.source ?? null,
  source_detail: r.source_detail ?? null,
  created_at: r.created_at,
  last_applied_at: r.last_applied_at,
});

// Every job has its own interview rounds. The full pipeline is always:
//   Applied -> <the job's rounds, in order> -> Offer -> Hired   (Rejected possible at any point)
export const DEFAULT_ROUNDS = ['Screening', 'Technical', 'HR Round'];
export const FIXED_STAGES = ['Applied', 'Offer', 'Hired', 'Rejected'];
export const stagesFor = (rounds) => ['Applied', ...rounds, 'Offer', 'Hired', 'Rejected'];
export const roundsOf = (json) => {
  const rounds = json ? parseList(json) : [];
  return Array.isArray(rounds) && rounds.length ? rounds : DEFAULT_ROUNDS;
};

export const toJob = (r) => {
  const rounds = roundsOf(r.rounds);
  return {
    id: r.id,
    company_id: r.company_id,
    company_name: r.company_name,
    title: r.title,
    required_skills: parseList(r.required_skills),
    description: r.description,
    status: r.status,
    rounds,
    stages: stagesFor(rounds),
    apply_token: r.apply_token,
    created_at: r.created_at,
  };
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
