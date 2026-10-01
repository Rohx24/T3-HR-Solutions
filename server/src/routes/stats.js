import { Router } from 'express';
import { db, parseList } from '../db.js';
import { STAGES, SKILLS } from '../skills.js';
import { listInterviews } from '../services.js';
import { workspaceId } from '../context.js';
import { AI_MODEL, aiEnabled } from '../aiParser.js';

const router = Router();

const count = (sql, ...params) => db.prepare(sql).get(...params).n;

function skillCounts() {
  const counts = new Map();
  for (const { skills } of db.prepare('SELECT skills FROM candidates WHERE workspace_id = ?').all(workspaceId())) {
    for (const s of parseList(skills)) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts].map(([skill, n]) => ({ skill, count: n })).sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill));
}

router.get('/stats', (req, res) => {
  const ws = workspaceId();
  // applications/events have no workspace column; they are scoped through their candidate.
  const stageRows = db.prepare(`
    SELECT a.stage, COUNT(*) AS n FROM applications a JOIN candidates c ON c.id = a.candidate_id
    WHERE c.workspace_id = ? GROUP BY a.stage
  `).all(ws);
  const byStage = Object.fromEntries(stageRows.map((r) => [r.stage, r.n]));

  res.json({
    totals: {
      candidates: count('SELECT COUNT(*) AS n FROM candidates WHERE workspace_id = ?', ws),
      returning: count('SELECT COUNT(*) AS n FROM candidates WHERE workspace_id = ? AND times_applied > 1', ws),
      open_jobs: count("SELECT COUNT(*) AS n FROM jobs WHERE workspace_id = ? AND status = 'open'", ws),
      active_applications: count(`
        SELECT COUNT(*) AS n FROM applications a JOIN candidates c ON c.id = a.candidate_id
        WHERE c.workspace_id = ? AND a.stage NOT IN ('Hired', 'Rejected')
      `, ws),
      hired: byStage.Hired ?? 0,
    },
    // Jobs have their own round names, so every interview round is grouped as "Interviewing".
    funnel: ['Applied', 'Interviewing', 'Offer', 'Hired', 'Rejected'].map((stage) => ({
      stage,
      count: stage === 'Interviewing'
        ? Object.entries(byStage).filter(([s]) => !['Applied', 'Offer', 'Hired', 'Rejected'].includes(s)).reduce((n, [, c]) => n + c, 0)
        : byStage[stage] ?? 0,
    })),
    upcoming_interviews: listInterviews({ upcoming: true, limit: 8 }),
    top_skills: skillCounts().slice(0, 10),
    roles: db.prepare(`
      SELECT primary_role AS role, COUNT(*) AS count FROM candidates WHERE workspace_id = ?
      GROUP BY primary_role ORDER BY count DESC, role
    `).all(ws),
    recent_events: db.prepare(`
      SELECT e.id, e.candidate_id, c.name AS candidate_name, e.type, e.message, e.actor, e.created_at
      FROM events e JOIN candidates c ON c.id = e.candidate_id
      WHERE c.workspace_id = ?
      ORDER BY e.created_at DESC, e.id DESC LIMIT 12
    `).all(ws),
  });
});

router.get('/meta', (req, res) => {
  // Roles come from the workspace's own candidates, so any profession (not just tech) can be filtered.
  const roles = db.prepare(`
    SELECT DISTINCT primary_role AS role FROM candidates
    WHERE workspace_id = ? AND primary_role IS NOT NULL AND primary_role <> '' ORDER BY role
  `).all(workspaceId()).map((r) => r.role);
  res.json({
    stages: STAGES,
    roles,
    skills: skillCounts().map((s) => s.skill).sort((a, b) => a.localeCompare(b)),
    all_skills: Object.keys(SKILLS).sort((a, b) => a.localeCompare(b)),
    parser: aiEnabled() ? { ai: true, model: AI_MODEL } : { ai: false, model: 'rules' },
  });
});

export default router;
