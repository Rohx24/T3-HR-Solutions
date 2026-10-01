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
`);

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
  created_at: r.created_at,
  last_applied_at: r.last_applied_at,
});

export const toJob = (r) => ({
  id: r.id,
  company_id: r.company_id,
  company_name: r.company_name,
  title: r.title,
  required_skills: parseList(r.required_skills),
  description: r.description,
  status: r.status,
  created_at: r.created_at,
});

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
