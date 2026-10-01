import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { HttpError, UPLOAD_DIR } from '../db.js';
import { clearWorkspace } from '../services.js';
import { DEMO_ACCOUNT } from '../seed.js';

const router = Router();

// DELETE /api/workspace/data  { confirm: "DELETE" }
// Lets a workspace admin wipe their own workspace (e.g. to drop example data) and start from zero.
router.delete('/data', (req, res) => {
  if (req.user.role !== 'admin') throw new HttpError(403, 'Only a workspace admin can clear its data');
  if (DEMO_ACCOUNT && req.user.email.toLowerCase() === DEMO_ACCOUNT.email.toLowerCase()) {
    throw new HttpError(403, 'The shared demo workspace cannot be cleared');
  }
  if (req.body?.confirm !== 'DELETE') throw new HttpError(400, 'Send { "confirm": "DELETE" } to confirm');

  const { files, ...counts } = clearWorkspace();
  for (const f of files) fs.rmSync(path.join(UPLOAD_DIR, path.basename(f)), { force: true });
  res.json({ ok: true, deleted: counts });
});

export default router;
