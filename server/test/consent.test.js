import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-int-consent-'));
process.env.DB_PATH = ':memory:';
delete process.env.OPENAI_API_KEY;

const { db, UPLOAD_DIR } = await import('../src/db.js');
const { createAccount } = await import('../src/auth.js');
const { runAs } = await import('../src/context.js');
const { parseResume } = await import('../src/parser.js');
const S = await import('../src/services.js');
const C = await import('../src/calls.js');
const K = await import('../src/consent.js');
const { submitApplication } = await import('../src/apply.js');

const hr = createAccount({ name: 'Anjali Rao', email: 'anjali@t3cogno.example' });
const other = createAccount({ name: 'Other Firm', email: 'other@elsewhere.example' });
const as = (fn) => runAs({ workspaceId: hr.workspace_id, user: { id: hr.id, name: hr.name } }, fn);
const asOther = (fn) => runAs({ workspaceId: other.workspace_id, user: { id: other.id, name: other.name } }, fn);
const newCandidate = (name = 'Meena Iyer') =>
  as(() => S.upsertCandidate(parseResume(`${name}\n${name.split(' ')[0].toLowerCase()}.${Math.random()}@example.com\n+91 98450 11111\nJava, Spring Boot. 4 years of experience.`)).id);
const audio = () => {
  const name = `consent-test-${Math.random().toString(36).slice(2)}.webm`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from('fake audio'));
  return name;
};
const tokenOf = (p) => p.split('/').pop();

test('the notice is versioned and says what, why, who, how long and how to say no', () => {
  const n = K.notice();
  assert.equal(n.version, K.NOTICE_VERSION);
  assert.deepEqual(n.sections.map((s) => s.title), ['What we record', 'Why', 'Who handles it', 'How long we keep it', 'Your choice']);
  assert.match(n.sections.find((s) => s.title === 'Who handles it').text, /OpenAI/);
  assert.ok(n.contact_email);
});

test('recording needs consent; typed notes never do', () => {
  const cand = newCandidate();
  assert.throws(() => as(() => C.createCall({ candidateId: cand, method: 'recorded', audioFile: audio() })), { status: 400 });
  assert.throws(() => as(() => C.createCall({ candidateId: cand, method: 'recorded', audioFile: audio(), consentBasis: 'prior' })),
    { status: 409, message: /hasn't agreed/ });
  const id = as(() => C.createCall({ candidateId: cand, method: 'typed', notes: 'Spoke briefly, 30 days notice.' }));
  assert.ok(id);
  assert.equal(as(() => K.consentSummary(cand)).status, null);
});

test('consent link: candidate sees only their first name, says yes, and recording is allowed', async () => {
  const cand = newCandidate('Meena Iyer');
  const link = as(() => K.createConsentLink(cand));
  assert.match(link.path, /^\/consent\/[A-Za-z0-9_-]{24}$/);
  assert.equal(as(() => K.consentSummary(cand)).status, 'requested');

  const view = K.readConsentLink(tokenOf(link.path));
  assert.deepEqual(Object.keys(view).sort(), ['expired', 'first_name', 'notice', 'status']);
  assert.equal(view.first_name, 'Meena');
  assert.equal(view.status, null);

  const res = await K.answerConsentLink(tokenOf(link.path), 'granted', { ip: '203.0.113.7', userAgent: 'Mobile Safari' });
  assert.equal(res.status, 'granted');
  const row = db.prepare('SELECT * FROM consents WHERE candidate_id = ? ORDER BY id DESC').get(cand);
  assert.equal(row.method, 'link');
  assert.equal(row.ip, '203.0.113.7');
  assert.equal(row.notice_version, K.NOTICE_VERSION);

  const callId = as(() => C.createCall({ candidateId: cand, method: 'recorded', audioFile: audio(), consentBasis: 'prior' }));
  assert.equal(as(() => C.getCallScoped(callId)).consent_basis, 'prior');
  const detail = as(() => S.getCandidateDetail(cand));
  assert.equal(detail.recording_consent.status, 'granted');
  assert.ok(detail.events.some((e) => /Agreed to call recording using the consent link/.test(e.message)));
});

test('saying no after yes is a withdrawal and blocks recording again', async () => {
  const cand = newCandidate('Ravi Kumar');
  const link = as(() => K.createConsentLink(cand));
  await K.answerConsentLink(tokenOf(link.path), 'granted');
  const res = await K.answerConsentLink(tokenOf(link.path), 'refused');
  assert.equal(res.status, 'withdrawn');
  assert.throws(() => as(() => C.createCall({ candidateId: cand, method: 'uploaded', audioFile: audio(), consentBasis: 'prior' })),
    { status: 409, message: /said no/ });
  // The recruiter can still confirm the candidate agreed again on a new call.
  assert.ok(as(() => C.createCall({ candidateId: cand, method: 'recorded', audioFile: audio(), consentBasis: 'verbal', recordedBy: 'Anjali Rao' })));
  assert.equal(as(() => K.consentSummary(cand)).method, 'verbal');
});

test('invalid and expired links are refused; other workspaces cannot create links', async () => {
  assert.throws(() => K.readConsentLink('not-a-token'), { status: 404 });
  const cand = newCandidate('Asha Menon');
  const link = as(() => K.createConsentLink(cand));
  db.prepare("UPDATE consent_links SET expires_at = '2000-01-01T00:00:00.000Z'").run();
  assert.equal(K.readConsentLink(tokenOf(link.path)).expired, true);
  await assert.rejects(K.answerConsentLink(tokenOf(link.path), 'granted'), { status: 410 });
  assert.throws(() => asOther(() => K.createConsentLink(cand)), { status: 404 });
});

test('apply page: recording consent is a separate optional tick', async () => {
  const job = as(() => {
    const co = S.createCompany({ name: 'Nimbus Health' });
    return S.createJob({ company_id: co.id, title: 'Python Developer', required_skills: ['Python'] });
  });
  const resume = (n) => ({ buffer: Buffer.from(`${n}\nPython developer, Django, 3 years of experience. B.Tech`), originalname: 'cv.txt' });
  const base = { phone: '9845012345', contact_preference: 'phone', consent: 'true' };
  await submitApplication(job.apply_token, resume('Kiran Das'), { ...base, name: 'Kiran Das', email: 'kiran@example.com', recording_consent: 'true' }, { ip: '198.51.100.4' });
  await submitApplication(job.apply_token, resume('Lata Shah'), { ...base, name: 'Lata Shah', email: 'lata@example.com' });
  const idOf = (email) => db.prepare('SELECT id FROM candidates WHERE email = ?').get(email).id;
  const kiran = as(() => K.consentSummary(idOf('kiran@example.com')));
  assert.equal(kiran.status, 'granted');
  assert.equal(kiran.method, 'apply_page');
  assert.equal(as(() => K.consentSummary(idOf('lata@example.com'))).status, null);
});

test('recordings past the retention period are deleted even if never transcribed', () => {
  const cand = newCandidate('Old Recording');
  const file = audio();
  const id = as(() => C.createCall({ candidateId: cand, method: 'uploaded', audioFile: file, consentBasis: 'verbal' }));
  db.prepare("UPDATE calls SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(id);
  assert.ok(C.purgeOldRecordings() >= 1);
  assert.equal(fs.existsSync(path.join(UPLOAD_DIR, file)), false);
  const call = as(() => C.getCallScoped(id));
  assert.equal(call.audio_file, null);
  assert.ok(call.audio_deleted_at);
});
