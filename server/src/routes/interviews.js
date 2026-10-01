import { Router } from 'express';
import { listInterviews, scheduleInterview, updateInterview } from '../services.js';
import { idParam } from './util.js';

const router = Router();

// GET /api/interviews?upcoming=1  (the workspace's interviews, soonest first when upcoming)
router.get('/', (req, res) => {
  res.json(listInterviews({ upcoming: req.query.upcoming === '1', limit: Number(req.query.limit) || 50 }));
});

// POST /api/interviews { application_id, round, scheduled_at, duration_minutes?, interviewer?, location? }
router.post('/', (req, res) => {
  res.status(201).json(scheduleInterview(req.body));
});

// PATCH /api/interviews/:id { status: "completed" | "cancelled" | "scheduled", scheduled_at?, completed_at?, ... }
router.patch('/:id', (req, res) => {
  res.json(updateInterview(idParam(req), req.body ?? {}));
});

export default router;
