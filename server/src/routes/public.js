import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { readFeedbackLink, submitFeedback } from '../feedback.js';
import { readApplyLink, submitApplication } from '../apply.js';
import { ALLOWED_EXTENSIONS } from '../parser.js';
import { HttpError } from '../db.js';
import { rateLimit } from '../ratelimit.js';

// Routes that work without signing in: the client interviewer's feedback form and the job apply page.
const router = Router();
const limit = rateLimit({ name: 'feedback-link', max: 30, windowSec: 15 * 60 });
const applyView = rateLimit({ name: 'apply-view', max: 120, windowSec: 15 * 60 });
// Each application can trigger an AI parse, so keep this tight per IP.
const applySubmit = rateLimit({
  name: 'apply-submit', max: 8, windowSec: 60 * 60,
  message: 'Too many applications from this connection. Please try again in an hour.',
});

const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20 },
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new HttpError(400, 'Please upload your resume as a PDF, Word (.docx) or text file.'), ok);
  },
});

router.get('/feedback/:token', limit, (req, res) => {
  res.json(readFeedbackLink(req.params.token));
});

router.post('/feedback/:token', limit, (req, res) => {
  res.status(201).json(submitFeedback(req.params.token, req.body ?? {}));
});

router.get('/apply/:token', applyView, (req, res) => {
  res.json(readApplyLink(req.params.token));
});

router.post('/apply/:token', applySubmit, resumeUpload.single('resume'), async (req, res) => {
  // Honeypot: a hidden field people never fill in. Bots that do get a normal-looking reply and nothing is saved.
  if (req.body?.website) return res.status(201).json({ first_name: '', job_title: '', company_name: '', whatsapp: { requested: false, chat_link: null } });
  res.status(201).json(await submitApplication(req.params.token, req.file, req.body ?? {}));
});

export default router;
