import { Router } from 'express';
import { readFeedbackLink, submitFeedback } from '../feedback.js';
import { rateLimit } from '../ratelimit.js';

// Routes that work without signing in. Only the feedback-link form lives here.
const router = Router();
const limit = rateLimit({ name: 'feedback-link', max: 30, windowSec: 15 * 60 });

router.get('/feedback/:token', limit, (req, res) => {
  res.json(readFeedbackLink(req.params.token));
});

router.post('/feedback/:token', limit, (req, res) => {
  res.status(201).json(submitFeedback(req.params.token, req.body ?? {}));
});

export default router;
