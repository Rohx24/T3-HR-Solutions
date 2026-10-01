// Call-recording consent (India's DPDP Act 2023: specific, informed, a clear yes, as easy to withdraw as to give).
//
// A candidate's answer can come from:
//   - the apply page (optional tick, separate from agreeing to be contacted),
//   - a one-time consent link the recruiter sends on WhatsApp / email / SMS,
//   - the call itself ("agreed verbally", recorded by the recruiter in the call dialog).
// Every answer is appended to `consents` with how, when, which notice version and (for links) IP and browser.
// The latest row is the current answer; a "no" after a "yes" is a withdrawal. Recording a call needs either a
// "yes" on file or the recruiter confirming the candidate agreed on that call (see requireRecordingConsent).
import crypto from 'node:crypto';
import { db, now, HttpError } from './db.js';
import { runAs, workspaceId, currentUser } from './context.js';
import { addEvent } from './services.js';
import { invalidateWorkspace } from './cache.js';

export const PURPOSE = 'call_recording';
export const NOTICE_VERSION = '2026-10-01';
export const RETENTION_DAYS = Number(process.env.RECORDING_RETENTION_DAYS ?? 7);
const LINK_DAYS = 30;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// The notice shown on the consent page and the privacy page. Its version is stored with every answer.
export function notice() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL || 'info@t3cogno.com';
  return {
    version: NOTICE_VERSION,
    contact_email: contact,
    sections: [
      { title: 'What we record', text: 'The audio of phone or WhatsApp calls between you and a T3Cogno recruiter, only if you agree.' },
      {
        title: 'Why',
        text: 'So the details you share (current and expected salary, notice period, availability, preferred locations) are written down accurately on your candidate profile, for the job you discussed and similar roles.',
      },
      {
        title: 'Who handles it',
        text: "T3Cogno's recruiting team; T3Cogno Talent, our recruiting software, hosted on Amazon Web Services; and OpenAI, which turns the audio into text and a short summary. Under its API terms, OpenAI does not use this data to train its models.",
      },
      {
        title: 'How long we keep it',
        text: `The recording is deleted as soon as the notes are written (at most ${RETENTION_DAYS} days). The written notes and summary stay on your profile while you are in our talent pool.`,
      },
      {
        title: 'Your choice',
        text: `Saying no does not affect your application: the recruiter will take notes by hand instead. You can change your answer at any time using your link, or by emailing ${contact}. You can also ask us to delete your data.`,
      },
    ],
  };
}

function rows(candidateId) {
  return db.prepare('SELECT * FROM consents WHERE candidate_id = ? AND purpose = ? ORDER BY id DESC').all(candidateId, PURPOSE);
}

// Current answer for a candidate: granted | refused | withdrawn | requested (link sent, no answer) | null.
export function consentSummary(candidateId) {
  const all = rows(candidateId);
  const latest = all[0];
  const openLink = db.prepare(`
    SELECT created_at FROM consent_links WHERE candidate_id = ? AND purpose = ? AND answered_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC LIMIT 1
  `).get(candidateId, PURPOSE, now());
  if (!latest) return { status: openLink ? 'requested' : null, requested_at: openLink?.created_at ?? null };
  const withdrawn = latest.status === 'refused' && all.some((r) => r.status === 'granted');
  return {
    status: withdrawn ? 'withdrawn' : latest.status,
    at: latest.created_at,
    method: latest.method,
    recorded_by: latest.recorded_by,
    notice_version: latest.notice_version,
    requested_at: openLink?.created_at ?? null,
  };
}

const METHOD_LABEL = { link: 'using the consent link', apply_page: 'on the apply page', verbal: 'on a call' };

export function recordConsent(candidateId, { status, method, recordedBy, callId, ip, userAgent } = {}, at = now()) {
  if (!['granted', 'refused'].includes(status)) throw new HttpError(400, 'status must be granted or refused');
  if (!['link', 'apply_page', 'verbal'].includes(method)) throw new HttpError(400, 'Unknown consent method');
  const before = consentSummary(candidateId).status;
  db.prepare(`
    INSERT INTO consents (candidate_id, purpose, status, method, notice_version, recorded_by, call_id, ip, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(candidateId, PURPOSE, status, method, NOTICE_VERSION, recordedBy ?? null, callId ?? null, ip ?? null,
    userAgent ? String(userAgent).slice(0, 300) : null, at);
  const verb = status === 'granted' ? 'Agreed to call recording' : before === 'granted' ? 'Withdrew consent to call recording' : 'Said no to call recording';
  addEvent(candidateId, 'consent', `${verb} ${METHOD_LABEL[method]}${recordedBy && method === 'verbal' ? ` (confirmed by ${recordedBy})` : ''}.`, at);
  return consentSummary(candidateId);
}

// Recording a call (live or uploaded) is only allowed with a "yes" on file, or when the recruiter confirms the
// candidate agreed on this call. Typed notes never need consent.
export function requireRecordingConsent(candidateId, basis) {
  if (basis === 'verbal') return;
  if (basis !== 'prior') throw new HttpError(400, 'Confirm that the candidate agreed to this call being recorded.');
  const { status } = consentSummary(candidateId);
  if (status !== 'granted') {
    throw new HttpError(409, status === 'refused' || status === 'withdrawn'
      ? 'This candidate said no to call recording. Type your notes instead, or confirm they agreed on this call.'
      : "This candidate hasn't agreed to call recording yet. Ask them first, or confirm they agreed on this call.");
  }
}

// ---------- one-time consent links (recruiter -> candidate) ----------

export function createConsentLink(candidateId, at = new Date()) {
  const cand = db.prepare('SELECT id, name FROM candidates WHERE id = ? AND workspace_id = ?').get(candidateId, workspaceId());
  if (!cand) throw new HttpError(404, 'Candidate not found');
  const token = crypto.randomBytes(18).toString('base64url');
  const expires = new Date(at.getTime() + LINK_DAYS * 86_400_000);
  const by = currentUser()?.name ?? null;
  db.prepare('INSERT INTO consent_links (token_hash, candidate_id, purpose, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sha256(token), cand.id, PURPOSE, by, at.toISOString(), expires.toISOString());
  addEvent(cand.id, 'consent', 'Created a consent link to ask about recording calls.', at.toISOString());
  return { token, path: `/consent/${token}`, expires_at: expires.toISOString(), recruiter_name: by };
}

function findLink(token) {
  const t = String(token ?? '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) return null;
  return db.prepare(`
    SELECT cl.token_hash, cl.candidate_id, cl.expires_at, c.name, c.workspace_id
    FROM consent_links cl JOIN candidates c ON c.id = cl.candidate_id WHERE cl.token_hash = ?
  `).get(sha256(t)) ?? null;
}

function requireLink(token) {
  const link = findLink(token);
  if (!link) throw new HttpError(404, 'This link is not valid. Please ask your T3Cogno recruiter for a new one.');
  return link;
}

// Public: shows only the candidate's first name, their current answer and the notice.
export function readConsentLink(token) {
  const link = requireLink(token);
  const { status } = consentSummary(link.candidate_id);
  return {
    first_name: link.name.split(' ')[0],
    status: status === 'requested' ? null : status,
    expired: link.expires_at < now(),
    notice: notice(),
  };
}

// Public: the candidate answers (or changes their answer). Allowed while the link is valid.
export async function answerConsentLink(token, decision, { ip, userAgent } = {}) {
  const link = requireLink(token);
  if (link.expires_at < now()) throw new HttpError(410, 'This link has expired. Please ask your T3Cogno recruiter for a new one.');
  if (!['granted', 'refused'].includes(decision)) throw new HttpError(400, 'Please choose yes or no.');
  const summary = runAs({ workspaceId: link.workspace_id, user: { id: null, name: link.name } }, () => {
    const s = recordConsent(link.candidate_id, { status: decision, method: 'link', ip, userAgent });
    db.prepare('UPDATE consent_links SET answered_at = ? WHERE token_hash = ?').run(now(), link.token_hash);
    return s;
  });
  await invalidateWorkspace(link.workspace_id);
  return { status: summary.status };
}
