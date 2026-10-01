import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { db, toCandidate, UPLOAD_DIR, HttpError } from '../db.js';
import { extractText, parseResume, ALLOWED_EXTENSIONS } from '../parser.js';
import { upsertCandidate, addApplication, addNote, getCandidateDetail, getJob } from '../services.js';
import { idParam } from './util.js';

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

// GET /api/candidates?q=&skill=&role=
router.get('/', (req, res) => {
  const q = req.query.q?.trim() || null;
  const skill = req.query.skill?.trim() || null;
  const role = req.query.role?.trim() || null;

  const rows = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM applications a WHERE a.candidate_id = c.id) AS application_count
    FROM candidates c
    WHERE ($q IS NULL OR c.name LIKE $like OR c.email LIKE $like OR c.primary_role LIKE $like
           OR c.location LIKE $like OR c.skills LIKE $like OR c.resume_text LIKE $like)
      AND ($role IS NULL OR c.primary_role = $role)
      AND ($skill IS NULL OR c.skills LIKE $skillLike)
    ORDER BY c.last_applied_at DESC
  `).all({ q, like: `%${q}%`, role, skill, skillLike: `%"${skill}"%` });

  res.json(rows.map(toCandidate));
});

// POST /api/candidates/upload  (multipart: resume, job_id?)
router.post('/upload', upload.single('resume'), async (req, res) => {
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

  const parsed = parseResume(text);
  const stored = `${crypto.randomUUID()}${path.extname(req.file.originalname).toLowerCase()}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), req.file.buffer);

  const { id, returning } = upsertCandidate(parsed, { stored, original: req.file.originalname });

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

  res.status(201).json({ candidate: getCandidateDetail(id), returning, application });
});

router.get('/:id', (req, res) => {
  const candidate = getCandidateDetail(idParam(req));
  if (!candidate) throw new HttpError(404, 'Candidate not found');
  res.json(candidate);
});

router.get('/:id/resume', (req, res) => {
  const row = db.prepare('SELECT resume_file, resume_filename FROM candidates WHERE id = ?').get(idParam(req));
  if (!row) throw new HttpError(404, 'Candidate not found');
  const file = row.resume_file && path.join(UPLOAD_DIR, path.basename(row.resume_file));
  if (!file || !fs.existsSync(file)) throw new HttpError(404, 'No original resume file stored for this candidate');
  res.download(file, row.resume_filename ?? path.basename(file));
});

router.post('/:id/notes', (req, res) => {
  res.status(201).json(addNote(idParam(req), req.body));
});

export default router;
