import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-int-jd-'));
process.env.DB_PATH = ':memory:';
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;

const { draftJobFromDescription, cleanJobDetails, JD_SCHEMA } = await import('../src/jobDescription.js');
const { createAccount } = await import('../src/auth.js');
const { runAs } = await import('../src/context.js');
const S = await import('../src/services.js');

const JD = `Senior Java Developer
Acme Fintech, Bengaluru (Hybrid)
Experience: 4 to 7 years. Budget: 18 to 24 LPA. 2 openings. Notice: immediate to 30 days.
Must have: Java, Spring Boot, Microservices, SQL. Good to have: Kafka, AWS.
You will design payment APIs and mentor juniors.
Interview process: Technical round, Managerial round, HR discussion.`;

const AI_DRAFT = {
  title: 'Senior Java Developer', company_name: 'Acme Fintech', industry: 'Fintech', location: 'Bengaluru',
  work_mode: 'Hybrid', employment_type: 'Full-time', experience_min: 4, experience_max: 7, salary: '18 to 24 LPA',
  openings: 2, required_skills: ['Java', 'springboot', 'Microservices', 'SQL'], nice_to_have_skills: ['Apache Kafka', 'AWS', 'Java'],
  education: null, responsibilities: ['Design payment APIs', 'Mentor juniors'],
  interview_rounds: ['Technical round', 'Managerial round', 'HR discussion', 'Offer'], notice_period: 'Immediate to 30 days',
  summary: 'Senior Java role on the payments platform.',
};

const mockFetch = (calls = []) => async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push(body);
  return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(AI_DRAFT) } }] });
};

test('JD schema is valid for strict structured outputs', () => {
  const check = (s) => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(check);
    }
    if (s.type === 'array' && s.items) check(s.items);
  };
  check(JD_SCHEMA);
});

test('with AI: the draft is filled, skills normalised, fixed stages dropped from rounds', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  try {
    const calls = [];
    const { draft, parsed_by } = await draftJobFromDescription(JD, { fetchImpl: mockFetch(calls) });
    assert.equal(parsed_by, 'gpt-4o-mini');
    assert.equal(calls[0].response_format.json_schema.strict, true);
    assert.equal(draft.salary, '18 to 24 LPA');
    assert.ok(draft.required_skills.includes('Spring Boot'), 'springboot -> Spring Boot');
    assert.ok(draft.nice_to_have_skills.includes('Kafka'), 'Apache Kafka -> Kafka');
    assert.ok(!draft.nice_to_have_skills.includes('Java'), 'must-haves are not repeated as nice-to-have');
    assert.deepEqual(draft.interview_rounds, ['Technical round', 'Managerial round', 'HR discussion']);
  } finally {
    delete process.env.OPENAI_API_KEY;
  }
});

test('without AI: a basic draft with title and dictionary skills', async () => {
  const { draft, parsed_by } = await draftJobFromDescription(JD);
  assert.equal(parsed_by, 'rules');
  assert.equal(draft.title, 'Senior Java Developer');
  assert.ok(draft.required_skills.includes('Java') && draft.required_skills.includes('Spring Boot'));
});

test('too-short job descriptions are refused', async () => {
  await assert.rejects(() => draftJobFromDescription('Java dev'), /full job description/);
});

test('job details are cleaned and stored with the job', () => {
  assert.equal(cleanJobDetails({ work_mode: 'Not stated', salary: '' }), null);
  const owner = createAccount({ name: 'Recruiter One', email: 'r1@t3cogno.example' });
  const job = runAs({ workspaceId: owner.workspace_id, user: { id: owner.id, name: owner.name } }, () => {
    const co = S.createCompany({ name: 'Acme Fintech' });
    return S.createJob({
      company_id: co.id, title: 'Senior Java Developer', required_skills: ['Java'], rounds: ['Technical'],
      details: { location: 'Bengaluru', experience_min: 4, experience_max: 7, salary: '18 to 24 LPA', openings: 2,
        nice_to_have_skills: ['kafka'], responsibilities: ['Design payment APIs'], work_mode: 'Hybrid', bogus: 'x' },
      jd_text: JD,
    });
  });
  assert.equal(job.details.location, 'Bengaluru');
  assert.equal(job.details.experience_max, 7);
  assert.deepEqual(job.details.nice_to_have_skills, ['Kafka']);
  assert.equal(job.details.bogus, undefined, 'unknown keys are dropped');
  assert.match(job.jd_text, /Interview process/);
});
