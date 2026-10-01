import { Router } from 'express';
import { db } from '../db.js';
import { createCompany } from '../services.js';
import { workspaceId } from '../context.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare(`
    SELECT c.id, c.name, c.industry, COUNT(j.id) AS job_count
    FROM companies c LEFT JOIN jobs j ON j.company_id = c.id
    WHERE c.workspace_id = ?
    GROUP BY c.id ORDER BY c.name
  `).all(workspaceId()));
});

router.post('/', (req, res) => {
  res.status(201).json(createCompany(req.body));
});

export default router;
