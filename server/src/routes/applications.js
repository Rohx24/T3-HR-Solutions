import { Router } from 'express';
import { addApplication, moveStage } from '../services.js';
import { idParam } from './util.js';
import { HttpError } from '../db.js';

const router = Router();

router.post('/', (req, res) => {
  const candidateId = Number(req.body?.candidate_id);
  const jobId = Number(req.body?.job_id);
  if (!candidateId || !jobId) throw new HttpError(400, 'candidate_id and job_id are required');
  res.status(201).json(addApplication(candidateId, jobId));
});

router.patch('/:id', (req, res) => {
  res.json(moveStage(idParam(req), req.body?.stage));
});

export default router;
