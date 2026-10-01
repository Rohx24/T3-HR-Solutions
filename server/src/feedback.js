// Feedback links: the HR sends a client's interviewer a one-time link for one interview round.
// The interviewer opens it without an account, sees only the candidate's name, role and the round,
// and submits a result, a rating and comments. It lands on the job's board like any other feedback.
import crypto from 'node:crypto';
import { db, now, HttpError } from './db.js';
import { runAs } from './context.js';
import { addNote, getInterview, updateInterview } from './services.js';

const LINK_DAYS = 21;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const DECISIONS = ['Passed', 'Not passed', 'On hold'];

export function createFeedbackLink(interviewId, createdBy) {
  const iv = getInterview(interviewId);
  if (!iv) throw new HttpError(404, 'Interview not found');
  if (iv.status === 'cancelled') throw new HttpError(400, 'This interview was cancelled');
  const token = crypto.randomBytes(24).toString('base64url');
  const at = new Date();
  const expires = new Date(at.getTime() + LINK_DAYS * 86_400_000);
  db.prepare('INSERT INTO feedback_links (token_hash, interview_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(sha256(token), iv.id, createdBy ?? null, at.toISOString(), expires.toISOString());
  return { token, path: `/feedback/${token}`, expires_at: expires.toISOString() };
}

// Looks up a link without a signed-in user (public route), returning only what the interviewer needs.
function findLink(token) {
  const row = db.prepare(`
    SELECT fl.token_hash, fl.expires_at, fl.used_at, i.id AS interview_id, i.round, i.scheduled_at, i.status AS interview_status,
           a.id AS application_id, c.id AS candidate_id, c.name AS candidate_name, c.primary_role, c.workspace_id,
           j.title AS job_title, co.name AS company_name
    FROM feedback_links fl
    JOIN interviews i ON i.id = fl.interview_id
    JOIN applications a ON a.id = i.application_id
    JOIN candidates c ON c.id = a.candidate_id
    JOIN jobs j ON j.id = a.job_id
    JOIN companies co ON co.id = j.company_id
    WHERE fl.token_hash = ?
  `).get(sha256(String(token ?? '')));
  if (!row) throw new HttpError(404, 'This feedback link is not valid');
  return row;
}

export function readFeedbackLink(token) {
  const r = findLink(token);
  return {
    candidate_name: r.candidate_name,
    primary_role: r.primary_role,
    job_title: r.job_title,
    company_name: r.company_name,
    round: r.round,
    scheduled_at: r.scheduled_at,
    submitted: Boolean(r.used_at),
    expired: r.expires_at < now(),
  };
}

export function submitFeedback(token, { evaluator_name, rating, decision, comments } = {}) {
  const r = findLink(token);
  if (r.used_at) throw new HttpError(409, 'Feedback for this interview has already been submitted. Thank you!');
  if (r.expires_at < now()) throw new HttpError(410, 'This feedback link has expired. Please ask the recruiter for a new one.');
  const name = String(evaluator_name ?? '').trim().slice(0, 80);
  if (!name) throw new HttpError(400, 'Please enter your name');
  if (!DECISIONS.includes(decision)) throw new HttpError(400, 'Please choose a result');
  if (!String(comments ?? '').trim()) throw new HttpError(400, 'Please write a few words about the interview');

  // Act inside the candidate's workspace, as the interviewer.
  return runAs({ workspaceId: r.workspace_id, user: { id: null, name } }, () => {
    const note = addNote(r.candidate_id, {
      application_id: r.application_id,
      round: r.round,
      author: name,
      rating,
      body: comments,
      decision,
      evaluator_company: r.company_name,
      interview_id: r.interview_id,
    });
    if (r.interview_status === 'scheduled') updateInterview(r.interview_id, { status: 'completed' });
    db.prepare('UPDATE feedback_links SET used_at = ? WHERE token_hash = ?').run(now(), r.token_hash);
    return { ok: true, note_id: note.id };
  });
}
