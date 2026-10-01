import { Router } from 'express';
import { db, parseList } from '../db.js';
import { STAGES, ROLES, SKILLS } from '../skills.js';

const router = Router();

const count = (sql, ...params) => db.prepare(sql).get(...params).n;

function skillCounts() {
  const counts = new Map();
  for (const { skills } of db.prepare('SELECT skills FROM candidates').all()) {
    for (const s of parseList(skills)) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts].map(([skill, n]) => ({ skill, count: n })).sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill));
}

router.get('/stats', (req, res) => {
  const stageRows = db.prepare('SELECT stage, COUNT(*) AS n FROM applications GROUP BY stage').all();
  const byStage = Object.fromEntries(stageRows.map((r) => [r.stage, r.n]));

  res.json({
    totals: {
      candidates: count('SELECT COUNT(*) AS n FROM candidates'),
      returning: count('SELECT COUNT(*) AS n FROM candidates WHERE times_applied > 1'),
      open_jobs: count("SELECT COUNT(*) AS n FROM jobs WHERE status = 'open'"),
      active_applications: count("SELECT COUNT(*) AS n FROM applications WHERE stage NOT IN ('Hired', 'Rejected')"),
      hired: byStage.Hired ?? 0,
    },
    funnel: STAGES.map((stage) => ({ stage, count: byStage[stage] ?? 0 })),
    top_skills: skillCounts().slice(0, 10),
    roles: db.prepare(`
      SELECT primary_role AS role, COUNT(*) AS count FROM candidates GROUP BY primary_role ORDER BY count DESC, role
    `).all(),
    recent_events: db.prepare(`
      SELECT e.id, e.candidate_id, c.name AS candidate_name, e.type, e.message, e.created_at
      FROM events e JOIN candidates c ON c.id = e.candidate_id
      ORDER BY e.created_at DESC, e.id DESC LIMIT 12
    `).all(),
  });
});

router.get('/meta', (req, res) => {
  res.json({
    stages: STAGES,
    roles: ROLES,
    skills: skillCounts().map((s) => s.skill).sort((a, b) => a.localeCompare(b)),
    all_skills: Object.keys(SKILLS).sort((a, b) => a.localeCompare(b)),
  });
});

export default router;
