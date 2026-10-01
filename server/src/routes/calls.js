import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { HttpError, UPLOAD_DIR, db, now } from '../db.js';
import { getCallScoped, processCall } from '../calls.js';
import { runAs } from '../context.js';
import { idParam } from './util.js';

const router = Router();

// GET /api/calls/:id/audio  (play the recording back)
router.get('/:id/audio', (req, res) => {
  const call = getCallScoped(idParam(req));
  if (!call?.audio_file) throw new HttpError(404, 'No recording for this call');
  const file = path.join(UPLOAD_DIR, path.basename(call.audio_file));
  if (!fs.existsSync(file)) throw new HttpError(404, 'Recording file is missing');
  res.sendFile(file);
});

// POST /api/calls/:id/retry  (run transcription + summary again after a failure)
router.post('/:id/retry', (req, res) => {
  const call = getCallScoped(idParam(req));
  if (!call) throw new HttpError(404, 'Call not found');
  if (call.status === 'processing') throw new HttpError(409, 'This call is already being processed');
  db.prepare("UPDATE calls SET status = 'processing', error = NULL, updated_at = ? WHERE id = ?").run(now(), call.id);
  const ctx = req.ctx;
  setImmediate(() => runAs(ctx, () => processCall(call.id)));
  res.status(202).json({ ok: true });
});

export default router;
