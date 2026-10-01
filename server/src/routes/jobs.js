import { Router } from 'express';
import { db, toJob, toCandidate, parseList, HttpError } from '../db.js';
import { STAGES, normalizeSkills } from '../skills.js';
import { scoreMatch } from '../matching.js';
import { createJob, getJob } from '../services.js';
import { idParam } from './util.js';
import { workspaceId } from '../context.js';

const router = Router();

function withCounts(job) {
  const rows = db.prepare('SELECT stage, COUNT(*) AS n FROM applications WHERE job_id = ? GROUP BY stage').all(job.id);
  const stage_counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const r of rows) stage_counts[r.stage] = r.n;
  return { ...job, total: rows.reduce((sum, r) => sum + r.n, 0), stage_counts };
}

function requireJob(req) {
  const job = getJob(idParam(req));
  if (!job) throw new HttpError(404, 'Job not found');
  return job;
}

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT j.*, c.name AS company_name FROM jobs j JOIN companies c ON c.id = j.company_id
    WHERE j.workspace_id = ?
    ORDER BY (j.status = 'open') DESC, j.created_at DESC
  `).all(workspaceId());
  res.json(rows.map(toJob).map(withCounts));
});

router.post('/', (req, res) => {
  res.status(201).json(withCounts(createJob(req.body)));
});

router.get('/:id', (req, res) => {
  const job = requireJob(req);
  const applications = db.prepare(`
    SELECT a.id, a.stage, a.match_score, a.created_at,
           c.id AS candidate_id, c.name, c.primary_role, c.years_experience, c.skills, c.times_applied
    FROM applications a JOIN candidates c ON c.id = a.candidate_id
    WHERE a.job_id = ?
    ORDER BY a.match_score DESC, a.created_at
  `).all(job.id).map((r) => ({
    id: r.id,
    stage: r.stage,
    match_score: r.match_score,
    created_at: r.created_at,
    candidate: {
      id: r.candidate_id,
      name: r.name,
      primary_role: r.primary_role,
      years_experience: r.years_experience,
      skills: parseList(r.skills),
      times_applied: r.times_applied,
    },
  }));
  res.json({ ...withCounts(job), applications });
});

router.patch('/:id', (req, res) => {
  const job = requireJob(req);
  const { title, description, status, required_skills } = req.body ?? {};
  if (status !== undefined && !['open', 'closed'].includes(status)) throw new HttpError(400, 'status must be open or closed');
  db.prepare('UPDATE jobs SET title = ?, description = ?, status = ?, required_skills = ? WHERE id = ?').run(
    title?.trim() || job.title,
    description ?? job.description,
    status ?? job.status,
    JSON.stringify(required_skills !== undefined ? normalizeSkills(required_skills) : job.required_skills),
    job.id,
  );
  res.json(withCounts(getJob(job.id)));
});

// Ranked candidates from the talent pool who are not yet in this job's pipeline.
router.get('/:id/matches', (req, res) => {
  const job = requireJob(req);
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const rows = db.prepare(`
    SELECT * FROM candidates
    WHERE workspace_id = ? AND id NOT IN (SELECT candidate_id FROM applications WHERE job_id = ?)
  `).all(workspaceId(), job.id);

  const matches = rows
    .map((r) => {
      const c = toCandidate(r);
      return {
        candidate: {
          id: c.id, name: c.name, primary_role: c.primary_role, years_experience: c.years_experience,
          skills: c.skills, times_applied: c.times_applied, last_applied_at: c.last_applied_at,
        },
        ...scoreMatch(c.skills, job.required_skills),
      };
    })
    .filter((m) => m.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score || (b.candidate.years_experience ?? 0) - (a.candidate.years_experience ?? 0))
    .slice(0, limit);

  res.json(matches);
});

export default router;
