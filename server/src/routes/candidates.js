import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { db, toCandidate, UPLOAD_DIR, HttpError } from '../db.js';
import { extractText, ALLOWED_EXTENSIONS } from '../parser.js';
import { parseResumeSmart } from '../aiParser.js';
import { upsertCandidate, addApplication, addNote, getCandidateDetail, getJob, updateCandidateSource } from '../services.js';
import { toCsv } from '../csv.js';
import { rateLimit } from '../ratelimit.js';
import { createCall, getCallScoped, processCall, toCall } from '../calls.js';
import { createConsentLink, recordConsent } from '../consent.js';
import { runAs } from '../context.js';
import { idParam } from './util.js';
import { workspaceId, bindContext } from '../context.js';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new HttpError(400, 'Only .pdf, .docx and .txt resumes are supported'), ok);
  },
});

const router = Router();

// Shared by the list and the CSV export so both honour the same ?q=&skill=&role= filters.
function searchCandidates(query) {
  const q = query.q?.trim() || null;
  const skill = query.skill?.trim() || null;
  const role = query.role?.trim() || null;

  return db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM applications a WHERE a.candidate_id = c.id) AS application_count
    FROM candidates c
    WHERE c.workspace_id = $ws AND ($q IS NULL OR c.name LIKE $like OR c.email LIKE $like OR c.primary_role LIKE $like
           OR c.location LIKE $like OR c.skills LIKE $like OR c.resume_text LIKE $like)
      AND ($role IS NULL OR c.primary_role = $role)
      AND ($skill IS NULL OR c.skills LIKE $skillLike)
      AND ($source IS NULL OR c.source = $source)
    ORDER BY c.last_applied_at DESC
  `).all({ ws: workspaceId(), q, like: `%${q}%`, role, skill, skillLike: `%"${skill}"%`, source: query.source?.trim() || null }).map(toCandidate);
}

// GET /api/candidates?q=&skill=&role=
router.get('/', (req, res) => {
  res.json(searchCandidates(req.query));
});

// GET /api/candidates/export.csv?q=&skill=&role=  (download the filtered talent pool for clients/spreadsheets)
router.get('/export.csv', (req, res) => {
  const csv = toCsv(searchCandidates(req.query));
  const stamp = new Date().toISOString().slice(0, 10);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="talent-pool-${stamp}.csv"`,
  });
  // BOM so Excel opens UTF-8 names correctly.
  res.send(`﻿${csv}`);
});

// POST /api/candidates/upload  (multipart: resume, job_id?)
// Parsing is the most expensive request, so cap it per user (shared across instances via Redis).
const uploadLimit = rateLimit({ name: 'upload', max: 30, windowSec: 60, key: (req) => req.user?.id ?? req.ip });

router.post('/upload', uploadLimit, upload.single('resume'), bindContext, async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Attach a resume file in the "resume" field');

  const jobId = req.body?.job_id ? Number(req.body.job_id) : null;
  if (jobId && !getJob(jobId)) throw new HttpError(400, 'job_id is invalid');

  let text;
  try {
    text = await extractText(req.file.buffer, req.file.originalname);
  } catch {
    throw new HttpError(422, 'Could not read this file. Is it a valid PDF/DOCX?');
  }
  if (text.trim().length < 30) throw new HttpError(422, 'No readable text found (scanned image PDFs are not supported yet)');

  // GPT-4.1 mini when OPENAI_API_KEY is set, rule-based parser otherwise (or if the AI call fails).
  const parsed = await parseResumeSmart(text);
  const stored = `${crypto.randomUUID()}${path.extname(req.file.originalname).toLowerCase()}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), req.file.buffer);

  const { id, returning } = upsertCandidate(parsed, { stored, original: req.file.originalname });
  if (req.body?.source) updateCandidateSource(id, { source: req.body.source, source_detail: req.body.source_detail });

  let application = null;
  if (jobId) {
    try {
      application = addApplication(id, jobId);
    } catch (err) {
      if (err.status !== 409) throw err;
      application = db.prepare(`
        SELECT id, candidate_id, job_id, stage, match_score, created_at, updated_at FROM applications WHERE candidate_id = ? AND job_id = ?
      `).get(id, jobId);
    }
  }

  res.status(201).json({ candidate: getCandidateDetail(id), returning, application, parse_warning: parsed.parse_warning ?? null });
});

router.get('/:id', (req, res) => {
  const candidate = getCandidateDetail(idParam(req));
  if (!candidate) throw new HttpError(404, 'Candidate not found');
  res.json(candidate);
});

router.get('/:id/resume', (req, res) => {
  const row = db.prepare('SELECT resume_file, resume_filename FROM candidates WHERE id = ? AND workspace_id = ?')
    .get(idParam(req), workspaceId());
  if (!row) throw new HttpError(404, 'Candidate not found');
  const file = row.resume_file && path.join(UPLOAD_DIR, path.basename(row.resume_file));
  if (!file || !fs.existsSync(file)) throw new HttpError(404, 'No original resume file stored for this candidate');
  res.download(file, row.resume_filename ?? path.basename(file));
});

router.post('/:id/notes', (req, res) => {
  res.status(201).json(addNote(idParam(req), req.body));
});

// PATCH /api/candidates/:id  { source, source_detail }
router.patch('/:id', (req, res) => {
  const id = idParam(req);
  updateCandidateSource(id, req.body ?? {});
  res.json(getCandidateDetail(id));
});

// ---------- calls: live recording, uploaded recording, or typed notes ----------

const AUDIO_EXT = ['.webm', '.ogg', '.oga', '.opus', '.mp3', '.m4a', '.mp4', '.aac', '.wav', '.amr', '.3gp', '.3gpp', '.flac', '.mpeg', '.mpga', '.wma'];
const audioUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `call-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase() || '.webm'}`),
  }),
  limits: { fileSize: 80 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = file.mimetype.startsWith('audio/') || file.mimetype === 'video/mp4' || file.mimetype === 'video/webm' || AUDIO_EXT.includes(ext);
    cb(ok ? null : new HttpError(400, 'Please choose an audio recording (mp3, m4a, wav, amr, 3gp, ogg or webm)'), ok);
  },
});
const consentLimit = rateLimit({ name: 'consent-link', max: 30, windowSec: 60 * 60, key: (req) => req.user?.id ?? req.ip });
const callLimit = rateLimit({ name: 'call', max: 20, windowSec: 60, key: (req) => req.user?.id ?? req.ip });

// POST /api/candidates/:id/calls  multipart: audio? (file), method (recorded|uploaded|typed), channel (phone|whatsapp),
//   consent_basis (prior|verbal, required with audio), notes?, application_id?
router.post('/:id/calls', callLimit, audioUpload.single('audio'), bindContext, (req, res) => {
  const method = req.file ? (req.body?.method === 'recorded' ? 'recorded' : 'uploaded') : 'typed';
  let id;
  try {
    id = createCall({
      candidateId: idParam(req),
      applicationId: req.body?.application_id ? Number(req.body.application_id) : null,
      method,
      channel: req.body?.channel,
      consentBasis: req.body?.consent_basis,
      audioFile: req.file?.filename,
      audioName: req.file ? (method === 'recorded' ? 'Live recording' : req.file.originalname) : null,
      notes: req.body?.notes,
      recordedBy: req.user?.name,
    });
  } catch (err) {
    // Refused (e.g. no recording consent): don't keep the uploaded audio around.
    if (req.file) fs.rmSync(path.join(UPLOAD_DIR, path.basename(req.file.filename)), { force: true });
    throw err;
  }
  const call = getCallScoped(id);
  if (call.status === 'processing') {
    const ctx = req.ctx;
    setImmediate(() => runAs(ctx, () => processCall(id)));
  }
  const { audio_file, ...safe } = call;
  res.status(202).json(toCall(safe));
});

// POST /api/candidates/:id/consent-link  -> one-time link the recruiter sends to ask for call-recording consent
router.post('/:id/consent-link', consentLimit, (req, res) => {
  res.status(201).json(createConsentLink(idParam(req)));
});

// POST /api/candidates/:id/consent  { status: granted|refused }  -> the candidate answered on a call
router.post('/:id/consent', (req, res) => {
  const id = idParam(req);
  if (!getCandidateDetail(id)) throw new HttpError(404, 'Candidate not found');
  res.status(201).json(recordConsent(id, { status: req.body?.status, method: 'verbal', recordedBy: req.user?.name }));
});

export default router;
