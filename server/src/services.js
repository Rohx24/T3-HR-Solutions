// Write-side business logic shared by the API routes and the seed script.
import { db, tx, now, parseList, toCandidate, toJob, HttpError } from './db.js';
import { STAGES, normalizeSkills } from './skills.js';
import { scoreMatch } from './matching.js';

const monthYear = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

export function addEvent(candidateId, type, message, at = now()) {
  db.prepare('INSERT INTO events (candidate_id, type, message, created_at) VALUES (?, ?, ?, ?)').run(candidateId, type, message, at);
}

export function getJob(id) {
  const row = db.prepare(`
    SELECT j.*, c.name AS company_name FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = ?
  `).get(id);
  return row ? toJob(row) : null;
}

export function getApplication(id) {
  return db.prepare(`
    SELECT id, candidate_id, job_id, stage, match_score, created_at, updated_at FROM applications WHERE id = ?
  `).get(id) ?? null;
}

export function getCandidateDetail(id) {
  const row = db.prepare('SELECT * FROM candidates WHERE id = ?').get(id);
  if (!row) return null;

  const applications = db.prepare(`
    SELECT a.id, a.job_id, j.title AS job_title, c.name AS company_name, a.stage, a.match_score, a.created_at
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN companies c ON c.id = j.company_id
    WHERE a.candidate_id = ?
    ORDER BY a.created_at DESC
  `).all(id);

  const notes = db.prepare(`
    SELECT n.id, n.application_id, j.title AS job_title, n.round, n.author, n.rating, n.body, n.created_at
    FROM notes n
    LEFT JOIN applications a ON a.id = n.application_id
    LEFT JOIN jobs j ON j.id = a.job_id
    WHERE n.candidate_id = ?
    ORDER BY n.created_at DESC, n.id DESC
  `).all(id);

  const events = db.prepare(`
    SELECT id, type, message, created_at FROM events WHERE candidate_id = ? ORDER BY created_at DESC, id DESC
  `).all(id);

  return {
    ...toCandidate({ ...row, application_count: applications.length }),
    resume_text: row.resume_text,
    has_resume_file: Boolean(row.resume_file),
    resume_filename: row.resume_filename,
    applications,
    notes,
    events,
  };
}

// Insert a new candidate, or merge into the existing one with the same email (returning candidate).
export function upsertCandidate(parsed, file = {}, at = now()) {
  return tx(() => {
    const existing = parsed.email ? db.prepare('SELECT * FROM candidates WHERE email = ?').get(parsed.email) : null;

    if (!existing) {
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO candidates (name, email, phone, location, years_experience, education, primary_role, skills,
                                resume_text, resume_file, resume_filename, times_applied, created_at, last_applied_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        parsed.name, parsed.email, parsed.phone, parsed.location, parsed.years_experience, parsed.education,
        parsed.primary_role, JSON.stringify(parsed.skills), parsed.resume_text,
        file.stored ?? null, file.original ?? null, at, at,
      );
      const id = Number(lastInsertRowid);
      addEvent(id, 'created', `Resume parsed: ${parsed.primary_role} · ${parsed.skills.length} skills found`, at);
      return { id, returning: false };
    }

    const oldSkills = parseList(existing.skills);
    const newSkills = parsed.skills.filter((s) => !oldSkills.includes(s));
    const merged = [...new Set([...parsed.skills, ...oldSkills])];

    db.prepare(`
      UPDATE candidates SET
        name = ?, phone = ?, location = ?, years_experience = ?, education = ?, primary_role = ?, skills = ?,
        resume_text = ?, resume_file = ?, resume_filename = ?, times_applied = times_applied + 1, last_applied_at = ?
      WHERE id = ?
    `).run(
      parsed.name !== 'Unknown Candidate' ? parsed.name : existing.name,
      parsed.phone ?? existing.phone,
      parsed.location ?? existing.location,
      parsed.years_experience ?? existing.years_experience,
      parsed.education ?? existing.education,
      parsed.primary_role,
      JSON.stringify(merged),
      parsed.resume_text,
      file.stored ?? existing.resume_file,
      file.original ?? existing.resume_filename,
      at,
      existing.id,
    );

    let message = `Returning candidate: resume re-parsed (first seen ${monthYear(existing.created_at)})`;
    if (newSkills.length) message += `. New skills: ${newSkills.join(', ')}`;
    if (parsed.years_experience && parsed.years_experience !== existing.years_experience) {
      message += `. Experience ${existing.years_experience ?? '?'} → ${parsed.years_experience} yrs`;
    }
    addEvent(existing.id, 'reapplied', message, at);
    return { id: existing.id, returning: true };
  });
}

export function addApplication(candidateId, jobId, at = now()) {
  return tx(() => {
    const candidate = db.prepare('SELECT id, skills FROM candidates WHERE id = ?').get(candidateId);
    const job = getJob(jobId);
    if (!candidate) throw new HttpError(404, 'Candidate not found');
    if (!job) throw new HttpError(404, 'Job not found');
    if (db.prepare('SELECT 1 FROM applications WHERE candidate_id = ? AND job_id = ?').get(candidateId, jobId)) {
      throw new HttpError(409, "Candidate is already in this job's pipeline");
    }

    const { match_score } = scoreMatch(parseList(candidate.skills), job.required_skills);
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO applications (candidate_id, job_id, stage, match_score, created_at, updated_at) VALUES (?, ?, 'Applied', ?, ?, ?)
    `).run(candidateId, jobId, match_score, at, at);
    addEvent(candidateId, 'applied', `Added to pipeline: ${job.title} @ ${job.company_name} (${match_score}% match)`, at);
    return getApplication(Number(lastInsertRowid));
  });
}

export function moveStage(applicationId, stage, at = now()) {
  if (!STAGES.includes(stage)) throw new HttpError(400, `stage must be one of: ${STAGES.join(', ')}`);
  return tx(() => {
    const app = getApplication(applicationId);
    if (!app) throw new HttpError(404, 'Application not found');
    if (app.stage === stage) return app;

    const job = getJob(app.job_id);
    db.prepare('UPDATE applications SET stage = ?, updated_at = ? WHERE id = ?').run(stage, at, applicationId);
    addEvent(app.candidate_id, 'stage', `${app.stage} → ${stage} for ${job.title} @ ${job.company_name}`, at);
    return getApplication(applicationId);
  });
}

export function addNote(candidateId, { application_id, round, author, rating, body } = {}, at = now()) {
  const text = String(body ?? '').trim();
  if (!text) throw new HttpError(400, 'body is required');
  const stars = rating === undefined || rating === null || rating === '' ? null : Number(rating);
  if (stars !== null && !(Number.isInteger(stars) && stars >= 1 && stars <= 5)) {
    throw new HttpError(400, 'rating must be an integer from 1 to 5');
  }

  return tx(() => {
    if (!db.prepare('SELECT 1 FROM candidates WHERE id = ?').get(candidateId)) throw new HttpError(404, 'Candidate not found');

    let appId = null;
    let roundName = round ? String(round).trim() : null;
    if (application_id) {
      const app = getApplication(Number(application_id));
      if (!app || app.candidate_id !== candidateId) throw new HttpError(400, 'application_id does not belong to this candidate');
      appId = app.id;
      roundName ??= app.stage;
    }
    const who = author ? String(author).trim() : 'Recruiter';

    const { lastInsertRowid } = db.prepare(`
      INSERT INTO notes (candidate_id, application_id, round, author, rating, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(candidateId, appId, roundName, who, stars, text, at);
    addEvent(candidateId, 'note', `${who} commented on ${roundName ?? 'General'} round${stars ? ` (${stars}/5)` : ''}`, at);

    return db.prepare(`
      SELECT n.id, n.application_id, j.title AS job_title, n.round, n.author, n.rating, n.body, n.created_at
      FROM notes n LEFT JOIN applications a ON a.id = n.application_id LEFT JOIN jobs j ON j.id = a.job_id
      WHERE n.id = ?
    `).get(Number(lastInsertRowid));
  });
}

export function createCompany({ name, industry } = {}, at = now()) {
  const n = String(name ?? '').trim();
  if (!n) throw new HttpError(400, 'name is required');
  if (db.prepare('SELECT 1 FROM companies WHERE name = ?').get(n)) throw new HttpError(409, 'Company already exists');
  const { lastInsertRowid } = db.prepare('INSERT INTO companies (name, industry, created_at) VALUES (?, ?, ?)')
    .run(n, industry ? String(industry).trim() : null, at);
  return { id: Number(lastInsertRowid), name: n, industry: industry ?? null, job_count: 0 };
}

export function createJob({ company_id, title, required_skills, description, status = 'open' } = {}, at = now()) {
  const t = String(title ?? '').trim();
  if (!t) throw new HttpError(400, 'title is required');
  if (!db.prepare('SELECT 1 FROM companies WHERE id = ?').get(Number(company_id))) throw new HttpError(400, 'company_id is invalid');
  if (!['open', 'closed'].includes(status)) throw new HttpError(400, 'status must be open or closed');

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO jobs (company_id, title, required_skills, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)
  `).run(Number(company_id), t, JSON.stringify(normalizeSkills(required_skills)), description ?? null, status, at);
  return getJob(Number(lastInsertRowid));
}
