import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

// Isolated DB for the service tests (must be set before db.js is imported).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-int-test-'));
process.env.DB_PATH = ':memory:';

const { parseResume } = await import('../src/parser.js');
const { extractSkills, normalizeSkills, detectRole } = await import('../src/skills.js');
const { scoreMatch } = await import('../src/matching.js');
const { upsertCandidate, getCandidateDetail } = await import('../src/services.js');
const { createAccount } = await import('../src/auth.js');
const { runAs } = await import('../src/context.js');

// Services are workspace-scoped, so service tests run inside a throwaway account's workspace.
const owner = createAccount({ name: 'Test Recruiter', email: 'parser-test@example.com', passwordHash: null });
const inWorkspace = (fn) => runAs({ workspaceId: owner.workspace_id, user: { id: owner.id, name: owner.name } }, fn);

const RESUME = `ANANYA IYER
Python Developer | Bangalore
ananya.iyer@example.com | +91 98840 22113
4+ years of experience building APIs.
Skills: Python, Django, PostgreSQL, REST APIs, Docker, AWS
Education: B.E. Computer Science`;

test('parses contact details, experience, education and location', () => {
  const p = parseResume(RESUME);
  assert.equal(p.name, 'Ananya Iyer');
  assert.equal(p.email, 'ananya.iyer@example.com');
  assert.equal(p.phone, '+91 98840 22113');
  assert.equal(p.years_experience, 4);
  assert.equal(p.education, 'B.E.');
  assert.equal(p.location, 'Bengaluru');
  assert.equal(p.primary_role, 'Python Developer');
});

test('skill matching respects word boundaries and implications', () => {
  assert.deepEqual(extractSkills('JavaScript and TypeScript'), ['JavaScript', 'TypeScript']);
  assert.ok(extractSkills('C++ and C# developer').includes('C++'));
  assert.ok(extractSkills('C++ and C# developer').includes('C#'));
  assert.ok(extractSkills('Worked with MySQL').includes('SQL'), 'MySQL implies SQL');
  assert.ok(!extractSkills('HTML pages').includes('Machine Learning'), '"ml" inside HTML must not match');
});

test('normalizes free-text skills to canonical names', () => {
  assert.deepEqual(normalizeSkills('springboot, k8s, react.js, Some Custom Skill'), ['Spring Boot', 'Kubernetes', 'React', 'Some Custom Skill']);
});

test('detects full stack when frontend framework and backend both present', () => {
  assert.equal(detectRole(['React', 'TypeScript', 'JavaScript', 'Node.js', 'Express.js', 'MongoDB']), 'Full Stack Developer');
  assert.equal(detectRole([]), 'Software Engineer');
});

test('match score is the % of required skills present', () => {
  const r = scoreMatch(['Java', 'Spring Boot', 'SQL'], ['Java', 'Spring Boot', 'Kafka', 'AWS']);
  assert.equal(r.match_score, 50);
  assert.deepEqual(r.missing_skills, ['Kafka', 'AWS']);
});

test('same email re-applying merges into the existing candidate', () => inWorkspace(() => {
  const first = upsertCandidate(parseResume(RESUME), {}, '2024-01-01T00:00:00.000Z');
  const second = upsertCandidate(parseResume(`${RESUME}\nAlso: Kafka, Kubernetes. 6 years total.`));
  assert.equal(first.returning, false);
  assert.equal(second.returning, true);
  assert.equal(second.id, first.id);

  const c = getCandidateDetail(first.id);
  assert.equal(c.times_applied, 2);
  assert.equal(c.years_experience, 6);
  assert.ok(c.skills.includes('Kafka') && c.skills.includes('Django'));
  assert.match(c.events[0].message, /Returning candidate.*Jan 2024/);
}));
