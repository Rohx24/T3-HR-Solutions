import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-int-ai-'));
process.env.DB_PATH = ':memory:';
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;

const { parseResumeSmart, RESUME_SCHEMA, AI_MODEL } = await import('../src/aiParser.js');

const RESUME = `Priya Sharma
Senior Java Developer | Bengaluru
priya.sharma@example.com | +91 98450 12345
6 years of experience. Skills: Java, Spring Boot, Kafka, MySQL, AWS
Experience: Lead Engineer, PayCore (Jan 2021 - Present). Built payment microservices handling 2M txns/day.
Education: B.Tech Computer Science, RV University, 2018`;

const AI_PROFILE = {
  name: 'Priya Sharma', email: 'priya.sharma@example.com', phone: '+91 98450 12345', location: 'Bengaluru',
  headline: 'Senior Java Developer, payments', current_title: 'Lead Engineer', current_company: 'PayCore',
  total_experience_years: 6, primary_role: 'Java Developer', role_category: 'Engineering & IT', seniority: 'Senior', industries: ['Fintech'],
  summary: 'Senior Java developer with 6 years in payments.', skills: ['Java', 'springboot', 'Apache Kafka', 'MySQL', 'AWS'],
  tools: ['Jira'], domain_expertise: ['Payments'], soft_skills: [], languages: [], highest_education: 'B.Tech',
  education: [{ degree: 'B.Tech', field: 'Computer Science', institution: 'RV University', start_year: null, end_year: '2018', grade: null }],
  experience: [{ title: 'Lead Engineer', company: 'PayCore', location: null, employment_type: 'Full-time', start: 'Jan 2021', end: null, is_current: true,
    duration_months: null, highlights: ['Built payment microservices handling 2M txns/day.'], skills_used: ['Java'] }],
  projects: [], certifications: [], achievements: [], publications: [], volunteering: [], interests: [],
  links: { linkedin: null, github: null, portfolio: null, other: [] }, preferred_locations: [], willing_to_relocate: null,
  notice_period: null, current_ctc: null, expected_ctc: null,
};

const okFetch = (profile, calls = []) => async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(profile) } }] }), { status: 200 });
};

test('without an API key the rule-based parser is used and no request is made', async () => {
  let called = false;
  const r = await parseResumeSmart(RESUME, { fetchImpl: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(r.parsed_by, 'rules');
  assert.equal(r.profile, null);
  assert.equal(r.email, 'priya.sharma@example.com');
});

test('sends GPT-4o mini a strict JSON-schema request', async () => {
  const calls = [];
  await parseResumeSmart(RESUME, { apiKey: 'test-key', fetchImpl: okFetch(AI_PROFILE, calls) });
  const { url, body, auth } = calls[0];
  assert.match(url, /\/chat\/completions$/);
  assert.equal(body.model, AI_MODEL);
  assert.equal(AI_MODEL, 'gpt-4o-mini');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(auth, 'Bearer test-key');
  assert.ok(body.messages[1].content.includes('PayCore'));
  // strict mode needs every property required and no extras, at every level
  const check = (s) => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(check);
    }
    if (s.type === 'array' && s.items) check(s.items);
  };
  check(RESUME_SCHEMA);
});

test('AI profile is merged: detailed fields kept, skills normalised for matching', async () => {
  const r = await parseResumeSmart(RESUME, { apiKey: 'k', fetchImpl: okFetch(AI_PROFILE) });
  assert.equal(r.parsed_by, 'gpt-4o-mini');
  assert.equal(r.years_experience, 6);
  assert.equal(r.primary_role, 'Java Developer');
  assert.equal(r.education, 'B.Tech');
  assert.ok(r.skills.includes('Spring Boot'), 'springboot -> Spring Boot');
  assert.ok(r.skills.includes('Kafka'), 'Apache Kafka -> Kafka');
  assert.equal(r.profile.experience[0].company, 'PayCore');
  assert.equal(r.profile.summary, 'Senior Java developer with 6 years in payments.');
});

test('an email the model made up is ignored', async () => {
  const text = RESUME.replace('priya.sharma@example.com | ', '');
  const r = await parseResumeSmart(text, { apiKey: 'k', fetchImpl: okFetch({ ...AI_PROFILE, email: 'invented@example.com' }) });
  assert.equal(r.email, null);
});

test('API failures fall back to the rule-based parser with a warning', async () => {
  const failing = async () => new Response('{"error":"rate limited"}', { status: 429 });
  const r = await parseResumeSmart(RESUME, { apiKey: 'k', fetchImpl: failing });
  assert.equal(r.parsed_by, 'rules');
  assert.match(r.parse_warning, /basic parser/);
  assert.equal(r.email, 'priya.sharma@example.com');
});

test('non-tech roles are kept as written (any profession)', async () => {
  const nurse = { ...AI_PROFILE, name: 'Anita Joseph', primary_role: 'Staff Nurse', role_category: 'Healthcare & Medical',
    skills: ['Patient Care', 'IV Cannulation', 'Wound Dressing'], tools: ['Ventilators'], email: null };
  const text = 'Anita Joseph\nStaff Nurse, ICU | Kochi\nanita.joseph@example.com\nPatient care, IV cannulation, wound dressing. 5 years.';
  const r = await parseResumeSmart(text, { apiKey: 'k', fetchImpl: okFetch(nurse) });
  assert.equal(r.primary_role, 'Staff Nurse');
  assert.ok(r.skills.includes('Patient Care') && r.skills.includes('Ventilators'));
  assert.equal(r.email, 'anita.joseph@example.com', 'regex email still wins');
  assert.equal(r.profile.role_category, 'Healthcare & Medical');
});
