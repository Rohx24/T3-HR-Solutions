// Write-side business logic shared by the API routes and the seed script.
import { consentSummary } from './consent.js';
import { db, tx, now, parseList, toCandidate, toJob, HttpError, DEFAULT_ROUNDS, FIXED_STAGES, roundsOf, stagesFor, newApplyToken } from './db.js';
import { normalizeSkills } from './skills.js';
import { scoreMatch } from './matching.js';
import { workspaceId, currentUser } from './context.js';
import { listCalls } from './calls.js';

const parseProfile = (json) => {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};
const monthYear = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

// Every event records who did it (the signed-in user), so activity feeds read "by <name>".
export function addEvent(candidateId, type, message, at = now()) {
  db.prepare('INSERT INTO events (candidate_id, type, message, actor, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(candidateId, type, message, currentUser()?.name ?? null, at);
}

export function getJob(id) {
  const row = db.prepare(`
    SELECT j.*, c.name AS company_name FROM jobs j JOIN companies c ON c.id = j.company_id
    WHERE j.id = ? AND j.workspace_id = ?
  `).get(id, workspaceId());
  return row ? toJob(row) : null;
}

export function getApplication(id) {
  return db.prepare(`
    SELECT a.id, a.candidate_id, a.job_id, a.stage, a.match_score, a.created_at, a.updated_at
    FROM applications a JOIN candidates c ON c.id = a.candidate_id
    WHERE a.id = ? AND c.workspace_id = ?
  `).get(id, workspaceId()) ?? null;
}

export function getCandidateDetail(id) {
  const row = db.prepare('SELECT * FROM candidates WHERE id = ? AND workspace_id = ?').get(id, workspaceId());
  if (!row) return null;

  const applications = db.prepare(`
    SELECT a.id, a.job_id, j.title AS job_title, c.name AS company_name, a.stage, a.match_score, a.created_at, j.rounds AS job_rounds
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN companies c ON c.id = j.company_id
    WHERE a.candidate_id = ?
    ORDER BY a.created_at DESC
  `).all(id).map(({ job_rounds, ...a }) => {
    const rounds = roundsOf(job_rounds);
    return { ...a, rounds, stages: stagesFor(rounds) };
  });

  const notes = db.prepare(`
    SELECT n.id, n.application_id, j.title AS job_title, n.round, n.author, n.rating, n.body, n.decision, n.evaluator_company, n.interview_id, n.created_at
    FROM notes n
    LEFT JOIN applications a ON a.id = n.application_id
    LEFT JOIN jobs j ON j.id = a.job_id
    WHERE n.candidate_id = ?
    ORDER BY n.created_at DESC, n.id DESC
  `).all(id);

  const events = db.prepare(`
    SELECT id, type, message, actor, created_at FROM events WHERE candidate_id = ? ORDER BY created_at DESC, id DESC
  `).all(id);

  return {
    ...toCandidate({ ...row, application_count: applications.length }),
    resume_text: row.resume_text,
    has_resume_file: Boolean(row.resume_file),
    resume_filename: row.resume_filename,
    profile: parseProfile(row.profile),
    parsed_by: row.parsed_by ?? 'rules',
    recording_consent: consentSummary(id),
    contact: {
      preference: row.contact_preference ?? null,
      consent_at: row.contact_consent_at ?? null,
      whatsapp_opt_in_at: row.whatsapp_opt_in_at ?? null,
      whatsapp_permission: row.whatsapp_permission ?? null,
    },
    applications,
    interviews: listInterviews({ candidateId: id, limit: 100 }),
    calls: listCalls(id),
    notes,
    events,
  };
}

// Insert a new candidate, or merge into the existing one with the same email (returning candidate).
export function upsertCandidate(parsed, file = {}, at = now()) {
  return tx(() => {
    const ws = workspaceId();
    const existing = parsed.email
      ? db.prepare('SELECT * FROM candidates WHERE workspace_id = ? AND email = ?').get(ws, parsed.email)
      : null;

    if (!existing) {
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO candidates (workspace_id, name, email, phone, location, years_experience, education, primary_role, skills,
                                resume_text, resume_file, resume_filename, profile, parsed_by, times_applied, created_at, last_applied_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        ws, parsed.name, parsed.email, parsed.phone, parsed.location, parsed.years_experience, parsed.education,
        parsed.primary_role, JSON.stringify(parsed.skills), parsed.resume_text,
        file.stored ?? null, file.original ?? null,
        parsed.profile ? JSON.stringify(parsed.profile) : null, parsed.parsed_by ?? 'rules', at, at,
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
        resume_text = ?, resume_file = ?, resume_filename = ?, profile = ?, parsed_by = ?,
        times_applied = times_applied + 1, last_applied_at = ?
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
      parsed.profile ? JSON.stringify(parsed.profile) : existing.profile,
      parsed.profile ? parsed.parsed_by : existing.parsed_by ?? parsed.parsed_by ?? 'rules',
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
    const candidate = db.prepare('SELECT id, skills FROM candidates WHERE id = ? AND workspace_id = ?').get(candidateId, workspaceId());
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
  return tx(() => {
    const app = getApplication(applicationId);
    if (!app) throw new HttpError(404, 'Application not found');
    const stages = getJob(app.job_id).stages;
    if (!stages.includes(stage)) throw new HttpError(400, `stage must be one of: ${stages.join(', ')}`);
    if (app.stage === stage) return app;

    const job = getJob(app.job_id);
    db.prepare('UPDATE applications SET stage = ?, updated_at = ? WHERE id = ?').run(stage, at, applicationId);
    addEvent(app.candidate_id, 'stage', `${app.stage} → ${stage} for ${job.title} @ ${job.company_name}`, at);
    return getApplication(applicationId);
  });
}

const DECISIONS = ['Passed', 'Not passed', 'On hold'];

export function addNote(candidateId, { application_id, round, author, rating, body, decision, evaluator_company, interview_id } = {}, at = now()) {
  const text = String(body ?? '').trim();
  if (!text) throw new HttpError(400, 'body is required');
  const stars = rating === undefined || rating === null || rating === '' ? null : Number(rating);
  if (stars !== null && !(Number.isInteger(stars) && stars >= 1 && stars <= 5)) {
    throw new HttpError(400, 'rating must be an integer from 1 to 5');
  }
  const result = decision === undefined || decision === null || decision === '' ? null : String(decision);
  if (result !== null && !DECISIONS.includes(result)) throw new HttpError(400, `decision must be one of: ${DECISIONS.join(', ')}`);

  return tx(() => {
    if (!db.prepare('SELECT 1 FROM candidates WHERE id = ? AND workspace_id = ?').get(candidateId, workspaceId())) {
      throw new HttpError(404, 'Candidate not found');
    }

    let appId = null;
    let roundName = round ? String(round).trim() : null;
    if (application_id) {
      const app = getApplication(Number(application_id));
      if (!app || app.candidate_id !== candidateId) throw new HttpError(400, 'application_id does not belong to this candidate');
      appId = app.id;
      roundName ??= app.stage;
    }
    const who = (author ? String(author).trim() : '') || currentUser()?.name || 'Recruiter';

    const { lastInsertRowid } = db.prepare(`
      INSERT INTO notes (candidate_id, application_id, round, author, rating, body, decision, evaluator_company, interview_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(candidateId, appId, roundName, who, stars, text, result,
      evaluator_company ? String(evaluator_company).trim().slice(0, 80) : null, interview_id ? Number(interview_id) : null, at);
    const verdict = result ? `: ${result}` : '';
    addEvent(candidateId, 'note', `${who} gave ${roundName ?? 'General'} feedback${verdict}${stars ? ` (${stars}/5)` : ''}`, at);

    return db.prepare(`
      SELECT n.id, n.application_id, j.title AS job_title, n.round, n.author, n.rating, n.body, n.decision, n.evaluator_company, n.interview_id, n.created_at
      FROM notes n LEFT JOIN applications a ON a.id = n.application_id LEFT JOIN jobs j ON j.id = a.job_id
      WHERE n.id = ?
    `).get(Number(lastInsertRowid));
  });
}

export function createCompany({ name, industry } = {}, at = now()) {
  const n = String(name ?? '').trim();
  if (!n) throw new HttpError(400, 'name is required');
  const ws = workspaceId();
  if (db.prepare('SELECT 1 FROM companies WHERE workspace_id = ? AND name = ?').get(ws, n)) throw new HttpError(409, 'Company already exists');
  const { lastInsertRowid } = db.prepare('INSERT INTO companies (workspace_id, name, industry, created_at) VALUES (?, ?, ?, ?)')
    .run(ws, n, industry ? String(industry).trim() : null, at);
  return { id: Number(lastInsertRowid), name: n, industry: industry ?? null, job_count: 0 };
}

// Cleans a job's list of interview rounds: 1 to 10 unique names, none clashing with the fixed stages.
export function validateRounds(input) {
  if (input === undefined || input === null) return DEFAULT_ROUNDS;
  if (!Array.isArray(input)) throw new HttpError(400, 'rounds must be a list of round names');
  const seen = new Set();
  const rounds = [];
  for (const raw of input) {
    const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!name) continue;
    if (name.length > 40) throw new HttpError(400, `Round name is too long: "${name.slice(0, 40)}..."`);
    const key = name.toLowerCase();
    if (FIXED_STAGES.some((s) => s.toLowerCase() === key)) {
      throw new HttpError(400, `"${name}" is added automatically. Choose a different round name.`);
    }
    if (seen.has(key)) throw new HttpError(400, `The round "${name}" is listed twice`);
    seen.add(key);
    rounds.push(name);
  }
  if (!rounds.length) throw new HttpError(400, 'A job needs at least one interview round');
  if (rounds.length > 10) throw new HttpError(400, 'A job can have at most 10 interview rounds');
  return rounds;
}

export function createJob({ company_id, title, required_skills, description, status = 'open', rounds } = {}, at = now()) {
  const t = String(title ?? '').trim();
  if (!t) throw new HttpError(400, 'title is required');
  const ws = workspaceId();
  if (!db.prepare('SELECT 1 FROM companies WHERE id = ? AND workspace_id = ?').get(Number(company_id), ws)) {
    throw new HttpError(400, 'company_id is invalid');
  }
  if (!['open', 'closed'].includes(status)) throw new HttpError(400, 'status must be open or closed');

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO jobs (workspace_id, company_id, title, required_skills, description, status, rounds, apply_token, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ws, Number(company_id), t, JSON.stringify(normalizeSkills(required_skills)), description ?? null, status,
    JSON.stringify(validateRounds(rounds)), newApplyToken(), at);
  return getJob(Number(lastInsertRowid));
}

// Deletes every candidate, job and company in the current workspace (applications, notes and events
// cascade). Returns the stored resume file names so the caller can remove them from disk.
export function clearWorkspace() {
  const ws = workspaceId();
  return tx(() => {
    const files = [
      ...db.prepare('SELECT resume_file AS f FROM candidates WHERE workspace_id = ? AND resume_file IS NOT NULL').all(ws),
      ...db.prepare(`SELECT ca.audio_file AS f FROM calls ca JOIN candidates c ON c.id = ca.candidate_id
                     WHERE c.workspace_id = ? AND ca.audio_file IS NOT NULL`).all(ws),
    ].map((r) => r.f);
    const candidates = db.prepare('DELETE FROM candidates WHERE workspace_id = ?').run(ws).changes;
    const jobs = db.prepare('DELETE FROM jobs WHERE workspace_id = ?').run(ws).changes;
    const companies = db.prepare('DELETE FROM companies WHERE workspace_id = ?').run(ws).changes;
    return { candidates, jobs, companies, files };
  });
}

// Changing a job's rounds must not strand anyone: a round that still has candidates can't be removed.
export function updateRounds(job, roundsInput) {
  const rounds = validateRounds(roundsInput);
  const removed = job.rounds.filter((r) => !rounds.includes(r));
  for (const r of removed) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM applications WHERE job_id = ? AND stage = ?').get(job.id, r).n;
    if (n) throw new HttpError(409, `${n} ${n === 1 ? 'person is' : 'people are'} still in "${r}". Move them to another round first.`);
  }
  db.prepare('UPDATE jobs SET rounds = ? WHERE id = ?').run(JSON.stringify(rounds), job.id);
  return rounds;
}

// ---------- interviews ----------

const INTERVIEW_SELECT = `
  SELECT i.id, i.application_id, i.round, i.scheduled_at, i.duration_minutes, i.interviewer, i.location, i.status,
         i.completed_at, i.created_at, a.candidate_id, c.name AS candidate_name, a.job_id, j.title AS job_title,
         co.name AS company_name
  FROM interviews i
  JOIN applications a ON a.id = i.application_id
  JOIN candidates c ON c.id = a.candidate_id
  JOIN jobs j ON j.id = a.job_id
  JOIN companies co ON co.id = j.company_id
`;

export function getInterview(id) {
  return db.prepare(`${INTERVIEW_SELECT} WHERE i.id = ? AND c.workspace_id = ?`).get(id, workspaceId()) ?? null;
}

export function listInterviews({ candidateId, jobId, upcoming, limit = 50 } = {}) {
  const where = ['c.workspace_id = ?'];
  const args = [workspaceId()];
  if (candidateId) (where.push('a.candidate_id = ?'), args.push(candidateId));
  if (jobId) (where.push('a.job_id = ?'), args.push(jobId));
  if (upcoming) (where.push("i.status = 'scheduled' AND i.scheduled_at >= ?"), args.push(new Date(Date.now() - 6 * 3600_000).toISOString()));
  const order = upcoming ? 'i.scheduled_at ASC' : 'i.scheduled_at DESC';
  return db.prepare(`${INTERVIEW_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`).all(...args, Math.min(limit, 200));
}

function parseWhen(value, field) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) throw new HttpError(400, `${field} must be a valid date and time`);
  return d.toISOString();
}

const cleanText = (v, max = 200) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);

// Scheduling an interview for a later round also moves the candidate into that round.
export function scheduleInterview({ application_id, round, scheduled_at, duration_minutes, interviewer, location } = {}, at = now()) {
  return tx(() => {
    const app = getApplication(Number(application_id));
    if (!app) throw new HttpError(404, 'Application not found');
    const job = getJob(app.job_id);
    if (!job.rounds.includes(round)) throw new HttpError(400, `Choose one of this job's rounds: ${job.rounds.join(', ')}`);
    const when = parseWhen(scheduled_at, 'scheduled_at');
    const minutes = duration_minutes ? Math.round(Number(duration_minutes)) : null;
    if (minutes !== null && !(minutes > 0 && minutes <= 600)) throw new HttpError(400, 'duration_minutes must be between 1 and 600');

    const { lastInsertRowid } = db.prepare(`
      INSERT INTO interviews (application_id, round, scheduled_at, duration_minutes, interviewer, location, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)
    `).run(app.id, round, when, minutes, cleanText(interviewer, 80) ?? currentUser()?.name ?? null, cleanText(location), at, at);

    const stages = job.stages;
    const closed = ['Hired', 'Rejected'].includes(app.stage);
    if (!closed && stages.indexOf(round) > stages.indexOf(app.stage)) moveStage(app.id, round, at);
    addEvent(app.candidate_id, 'interview', `${round} interview scheduled for ${job.title} @ ${job.company_name}`, at);
    return getInterview(Number(lastInsertRowid));
  });
}

// Mark finished / cancelled, reschedule, or edit the details of an interview.
export function updateInterview(id, { status, scheduled_at, completed_at, duration_minutes, interviewer, location } = {}, at = now()) {
  return tx(() => {
    const iv = getInterview(id);
    if (!iv) throw new HttpError(404, 'Interview not found');
    const next = { ...iv };
    if (scheduled_at !== undefined) next.scheduled_at = parseWhen(scheduled_at, 'scheduled_at');
    if (duration_minutes !== undefined) next.duration_minutes = duration_minutes ? Math.round(Number(duration_minutes)) : null;
    if (interviewer !== undefined) next.interviewer = cleanText(interviewer, 80);
    if (location !== undefined) next.location = cleanText(location);
    if (status !== undefined) {
      if (!['scheduled', 'completed', 'cancelled'].includes(status)) throw new HttpError(400, 'status must be scheduled, completed or cancelled');
      next.status = status;
      next.completed_at = status === 'completed' ? (completed_at ? parseWhen(completed_at, 'completed_at') : at) : null;
    }
    db.prepare(`
      UPDATE interviews SET scheduled_at = ?, duration_minutes = ?, interviewer = ?, location = ?, status = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(next.scheduled_at, next.duration_minutes, next.interviewer, next.location, next.status, next.completed_at, at, id);

    const what = `${iv.round} interview for ${iv.job_title}`;
    if (status === 'completed' && iv.status !== 'completed') addEvent(iv.candidate_id, 'interview', `${what} finished`, at);
    else if (status === 'cancelled' && iv.status !== 'cancelled') addEvent(iv.candidate_id, 'interview', `${what} cancelled`, at);
    else if (scheduled_at !== undefined && next.scheduled_at !== iv.scheduled_at) addEvent(iv.candidate_id, 'interview', `${what} rescheduled`, at);
    return getInterview(id);
  });
}

// Where the candidate came from (Naukri, LinkedIn, Referral...) and an optional detail such as the referrer.
export function updateCandidateSource(candidateId, { source, source_detail } = {}) {
  const row = db.prepare('SELECT id FROM candidates WHERE id = ? AND workspace_id = ?').get(candidateId, workspaceId());
  if (!row) throw new HttpError(404, 'Candidate not found');
  const src = source ? String(source).trim().slice(0, 60) : null;
  const detail = source_detail ? String(source_detail).trim().slice(0, 120) : null;
  db.prepare('UPDATE candidates SET source = ?, source_detail = ? WHERE id = ?').run(src, detail, candidateId);
}

// Feedback given on a job's applications, grouped by application (for the job's hiring board).
export function feedbackForJob(jobId) {
  const rows = db.prepare(`
    SELECT n.id, n.application_id, n.round, n.author, n.rating, n.body, n.decision, n.evaluator_company, n.interview_id, n.created_at
    FROM notes n JOIN applications a ON a.id = n.application_id
    WHERE a.job_id = ? ORDER BY n.created_at DESC, n.id DESC
  `).all(jobId);
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.application_id)) by.set(r.application_id, []);
    by.get(r.application_id).push(r);
  }
  return by;
}

