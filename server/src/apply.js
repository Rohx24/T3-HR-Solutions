// Public apply links. Every job has an unguessable apply_token; recruiters share /apply/<token> on job
// boards and WhatsApp (optionally with ?src=Naukri etc.). Applicants upload a resume without an account and
// land in that job's pipeline in the recruiter's workspace. Responses never reveal whether the applicant
// was already in the talent pool, or anything else about the workspace.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, now, parseList, UPLOAD_DIR, HttpError } from './db.js';
import { runAs } from './context.js';
import { extractText } from './parser.js';
import { parseResumeSmart } from './aiParser.js';
import { upsertCandidate, addApplication, addEvent, updateCandidateSource } from './services.js';
import { invalidateWorkspace } from './cache.js';
import { whatsappEnabled, whatsappChatLink, sendCallPermissionRequest, toWhatsAppNumber } from './whatsapp.js';

// Same list as the recruiter UI; anything else from ?src= is kept as detail under "Apply link".
const KNOWN_SOURCES = ['Naukri', 'LinkedIn', 'Indeed', 'Referral', 'Walk-in', 'Company website', 'Job fair', 'WhatsApp', 'Social media', 'Campus', 'Other'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function findJob(token) {
  const t = String(token ?? '');
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(t)) return null;
  return db.prepare(`
    SELECT j.id, j.workspace_id, j.title, j.description, j.required_skills, j.status, c.name AS company_name
    FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.apply_token = ?
  `).get(t) ?? null;
}

function requireJob(token) {
  const job = findJob(token);
  if (!job) throw new HttpError(404, 'This apply link is not valid. Please check the link or ask the recruiter for a new one.');
  return job;
}

export function readApplyLink(token) {
  const job = requireJob(token);
  return {
    title: job.title,
    company_name: job.company_name,
    description: job.description,
    required_skills: parseList(job.required_skills),
    open: job.status === 'open',
    whatsapp: { call_permission: whatsappEnabled() },
  };
}

function sourceFrom(src) {
  const s = String(src ?? '').trim().slice(0, 40);
  if (!s) return { source: 'Apply link', source_detail: null };
  const known = KNOWN_SOURCES.find((k) => k.toLowerCase() === s.toLowerCase());
  return known ? { source: known, source_detail: 'via apply link' } : { source: 'Apply link', source_detail: s };
}

const truthy = (v) => v === true || v === 'true' || v === 'on' || v === '1';

export async function submitApplication(token, file, body = {}) {
  const job = requireJob(token);
  if (job.status !== 'open') throw new HttpError(410, 'This job is no longer accepting applications.');

  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 120);
  const phone = String(body.phone ?? '').trim().slice(0, 20);
  const preference = ['whatsapp', 'phone'].includes(body.contact_preference) ? body.contact_preference : null;
  const whatsappOptIn = preference === 'whatsapp';
  if (name.length < 2) throw new HttpError(400, 'Please enter your full name.');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (!toWhatsAppNumber(phone)) throw new HttpError(400, 'Please enter a valid mobile number.');
  if (!preference) throw new HttpError(400, 'Please choose how our recruiter should call you.');
  if (!truthy(body.consent)) throw new HttpError(400, 'Please agree to be contacted about this job.');
  if (!file) throw new HttpError(400, 'Please attach your resume.');

  let text;
  try {
    text = await extractText(file.buffer, file.originalname);
  } catch {
    throw new HttpError(422, 'We could not read that file. Please upload your resume as a PDF or Word document.');
  }
  if (text.trim().length < 30) throw new HttpError(422, 'We could not find any text in that file (is it a scanned image?). Please upload a PDF or Word resume.');

  // What the applicant typed beats what the parser guessed.
  const parsed = { ...(await parseResumeSmart(text)), name, email, phone };
  const stored = `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), file.buffer);

  const at = now();
  const ctx = { workspaceId: job.workspace_id, user: { id: null, name } };
  const candidateId = runAs(ctx, () => {
    const { id } = upsertCandidate(parsed, { stored, original: file.originalname }, at);
    updateCandidateSource(id, sourceFrom(body.src));
    db.prepare('UPDATE candidates SET contact_consent_at = ?, contact_preference = ?, whatsapp_opt_in_at = COALESCE(?, whatsapp_opt_in_at) WHERE id = ?')
      .run(at, preference, whatsappOptIn ? at : null, id);
    try {
      addApplication(id, job.id, at);
    } catch (err) {
      if (err.status !== 409) throw err; // already in this job's pipeline: the new resume still updates the profile
    }
    addEvent(id, 'applied', `Applied through the apply link. Agreed to be contacted; prefers a ${whatsappOptIn ? 'WhatsApp call' : 'normal phone call'}.`, at);
    return id;
  });

  let whatsappRequested = false;
  if (whatsappOptIn && whatsappEnabled()) {
    try {
      await sendCallPermissionRequest({ phone, firstName: name.split(' ')[0], jobTitle: job.title });
      whatsappRequested = true;
    } catch (err) {
      console.error('WhatsApp call permission request failed:', err.message);
    }
    runAs(ctx, () => {
      db.prepare('UPDATE candidates SET whatsapp_permission = ? WHERE id = ?').run(whatsappRequested ? 'requested' : 'failed', candidateId);
      addEvent(candidateId, 'whatsapp', whatsappRequested
        ? 'Sent a WhatsApp request asking permission to call.'
        : 'Could not send the WhatsApp call permission request.');
    });
  }

  await invalidateWorkspace(job.workspace_id);
  return {
    first_name: name.split(' ')[0],
    job_title: job.title,
    company_name: job.company_name,
    whatsapp: {
      requested: whatsappRequested,
      chat_link: whatsappOptIn ? whatsappChatLink(`Hi, I just applied for ${job.title}.`) : null,
    },
  };
}
