import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-int-apply-'));
process.env.DB_PATH = ':memory:';
delete process.env.OPENAI_API_KEY;
delete process.env.WHATSAPP_TOKEN;

const { db } = await import('../src/db.js');
const { createAccount } = await import('../src/auth.js');
const { runAs } = await import('../src/context.js');
const { createCompany, createJob, getCandidateDetail } = await import('../src/services.js');
const { readApplyLink, submitApplication } = await import('../src/apply.js');
const { toWhatsAppNumber } = await import('../src/whatsapp.js');

const owner = createAccount({ name: 'Apply Owner', email: 'apply-owner@example.com', passwordHash: null });
const inWs = (fn) => runAs({ workspaceId: owner.workspace_id, user: { id: owner.id, name: owner.name } }, fn);
const job = inWs(() => {
  const co = createCompany({ name: 'Acme Fintech', industry: 'Fintech' });
  return createJob({ company_id: co.id, title: 'Senior Java Developer', required_skills: ['Java', 'Spring Boot', 'Kafka'] });
});

const RESUME = `Priya Sharma
Senior Java Developer | Bengaluru
5 years of experience. Skills: Java, Spring Boot, Kafka, MySQL, AWS
B.Tech Computer Science`;
const file = (text = RESUME) => ({ buffer: Buffer.from(text), originalname: 'priya.txt' });
const form = (extra = {}) => ({
  name: 'Priya Sharma', email: 'Priya.Sharma@Example.com', phone: '98450 12345',
  contact_preference: 'whatsapp', consent: 'true', src: 'naukri', ...extra,
});
const candidateByEmail = (email) => db.prepare('SELECT * FROM candidates WHERE workspace_id = ? AND email = ?').get(owner.workspace_id, email);

test('every job gets an unguessable apply token', () => {
  assert.match(job.apply_token, /^[A-Za-z0-9_-]{12}$/);
  const info = readApplyLink(job.apply_token);
  assert.equal(info.title, 'Senior Java Developer');
  assert.equal(info.company_name, 'Acme Fintech');
  assert.equal(info.open, true);
  assert.deepEqual(info.required_skills, ['Java', 'Spring Boot', 'Kafka']);
  assert.equal(info.whatsapp.call_permission, false);
  assert.throws(() => readApplyLink('not-a-real-token'), { status: 404 });
  assert.throws(() => readApplyLink('../../etc'), { status: 404 });
});

test('an application lands in the pool and the job pipeline with consent and preference recorded', async () => {
  const res = await submitApplication(job.apply_token, file(), form());
  assert.equal(res.first_name, 'Priya');
  assert.equal(res.whatsapp.requested, false); // WhatsApp API not configured in tests

  const c = candidateByEmail('priya.sharma@example.com');
  assert.ok(c, 'typed email is used (lower-cased)');
  assert.equal(c.name, 'Priya Sharma');
  assert.equal(c.source, 'Naukri');
  assert.equal(c.contact_preference, 'whatsapp');
  assert.ok(c.contact_consent_at && c.whatsapp_opt_in_at);
  assert.ok(JSON.parse(c.skills).includes('Kafka'));

  const detail = runAs({ workspaceId: owner.workspace_id }, () => getCandidateDetail(c.id));
  assert.equal(detail.applications.length, 1);
  assert.equal(detail.applications[0].job_id, job.id);
  assert.equal(detail.contact.preference, 'whatsapp');
  assert.match(detail.events.find((e) => e.type === 'applied' && /apply link/.test(e.message)).message, /WhatsApp call/);
});

test('applying again merges into the same candidate and says nothing different to the applicant', async () => {
  const res = await submitApplication(job.apply_token, file(`${RESUME}\nAlso: Kubernetes`), form({ contact_preference: 'phone', src: '' }));
  assert.equal(res.first_name, 'Priya');
  const rows = db.prepare('SELECT COUNT(*) AS n FROM candidates WHERE workspace_id = ? AND email = ?').get(owner.workspace_id, 'priya.sharma@example.com');
  assert.equal(rows.n, 1);
  const c = candidateByEmail('priya.sharma@example.com');
  assert.equal(c.times_applied, 2);
  assert.equal(c.contact_preference, 'phone');
  assert.equal(c.source, 'Apply link');
  assert.ok(JSON.parse(c.skills).includes('Kubernetes'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM applications WHERE candidate_id = ?').get(c.id).n, 1);
});

test('unknown ?src= values are kept as detail under "Apply link"', async () => {
  await submitApplication(job.apply_token, file(RESUME.replace('Priya Sharma', 'Arjun Mehta')), form({ name: 'Arjun Mehta', email: 'arjun@example.com', src: 'college-fest' }));
  const c = candidateByEmail('arjun@example.com');
  assert.equal(c.source, 'Apply link');
  assert.equal(c.source_detail, 'college-fest');
});

test('validation: consent, preference, contact details and file', async () => {
  const t = job.apply_token;
  await assert.rejects(submitApplication(t, file(), form({ consent: '' })), { status: 400, message: /agree/ });
  await assert.rejects(submitApplication(t, file(), form({ contact_preference: 'pigeon' })), { status: 400, message: /how our recruiter/ });
  await assert.rejects(submitApplication(t, file(), form({ email: 'nope' })), { status: 400, message: /email/ });
  await assert.rejects(submitApplication(t, file(), form({ phone: '123' })), { status: 400, message: /mobile/ });
  await assert.rejects(submitApplication(t, file(), form({ name: 'P' })), { status: 400, message: /name/ });
  await assert.rejects(submitApplication(t, null, form()), { status: 400, message: /resume/ });
  await assert.rejects(submitApplication(t, file('too short'), form()), { status: 422 });
});

test('closed jobs stop accepting applications', async () => {
  db.prepare("UPDATE jobs SET status = 'closed' WHERE id = ?").run(job.id);
  assert.equal(readApplyLink(job.apply_token).open, false);
  await assert.rejects(submitApplication(job.apply_token, file(), form()), { status: 410 });
  db.prepare("UPDATE jobs SET status = 'open' WHERE id = ?").run(job.id);
});

test('Indian mobile numbers are normalised for WhatsApp', () => {
  assert.equal(toWhatsAppNumber('98450 12345'), '919845012345');
  assert.equal(toWhatsAppNumber('09845012345'), '919845012345');
  assert.equal(toWhatsAppNumber('+91 98450-12345'), '919845012345');
  assert.equal(toWhatsAppNumber('123'), null);
});
