import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-int-auth-'));
process.env.DB_PATH = ':memory:';

const { hashPassword, verifyPassword, validateSignup, createAccount, createSession, userForToken, destroySession, readCookie } =
  await import('../src/auth.js');
const { runAs, workspaceId } = await import('../src/context.js');
const { upsertCandidate, getCandidateDetail, createCompany, createJob, addApplication } = await import('../src/services.js');
const { parseResume } = await import('../src/parser.js');

const as = (user, fn) => runAs({ workspaceId: user.workspace_id, user: { id: user.id, name: user.name } }, fn);

test('passwords are salted scrypt hashes and verify correctly', async () => {
  const a = await hashPassword('correct horse');
  const b = await hashPassword('correct horse');
  assert.match(a, /^scrypt\$/);
  assert.notEqual(a, b, 'same password must hash differently (random salt)');
  assert.equal(await verifyPassword('correct horse', a), true);
  assert.equal(await verifyPassword('wrong horse', a), false);
  assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
});

test('signup validation rejects bad input', () => {
  assert.throws(() => validateSignup({ name: 'A', email: 'a@b.co', password: 'longenough' }), /full name/);
  assert.throws(() => validateSignup({ name: 'Asha Rao', email: 'nope', password: 'longenough' }), /valid email/);
  assert.throws(() => validateSignup({ name: 'Asha Rao', email: 'asha@example.com', password: 'short' }), /8 characters/);
  assert.deepEqual(validateSignup({ name: ' Asha Rao ', email: 'Asha@Example.com', password: 'longenough' }),
    { name: 'Asha Rao', email: 'asha@example.com', password: 'longenough' });
});

test('each account gets its own workspace and duplicate emails are refused', () => {
  const u = createAccount({ name: 'Asha Rao', email: 'asha@example.com' });
  assert.equal(u.role, 'admin');
  assert.equal(u.workspace_name, "Asha's workspace");
  assert.throws(() => createAccount({ name: 'Asha Again', email: 'ASHA@example.com' }), /already exists/);
});

test('sessions resolve to their user until destroyed', () => {
  const u = createAccount({ name: 'Ravi Kumar', email: 'ravi@example.com' });
  const { token } = createSession(u.id, 'test');
  assert.equal(userForToken(token).id, u.id);
  assert.equal(userForToken('forged-token'), null);
  destroySession(token);
  assert.equal(userForToken(token), null);
});

test('cookie header parsing', () => {
  assert.equal(readCookie({ headers: { cookie: 'a=1; hr_sid=abc%3D; b=2' } }, 'hr_sid'), 'abc=');
  assert.equal(readCookie({ headers: {} }, 'hr_sid'), null);
});

test('services refuse to run without a signed-in workspace', () => {
  assert.throws(() => workspaceId(), /Sign in/);
});

test('workspaces are isolated: one tenant cannot see or touch another tenant’s data', () => {
  const alice = createAccount({ name: 'Alice Shah', email: 'alice@agency-a.com' });
  const bob = createAccount({ name: 'Bob Iyer', email: 'bob@agency-b.com' });
  const resume = parseResume('Neha Gupta\nneha@example.com\n+91 98450 00000\nJava, Spring Boot, SQL. 3 years of experience.');

  const aliceCandidate = as(alice, () => upsertCandidate(resume).id);
  // Same person applying through a different agency is a NEW candidate there, not a "returning" one.
  const bobUpsert = as(bob, () => upsertCandidate(resume));
  assert.equal(bobUpsert.returning, false);
  assert.notEqual(bobUpsert.id, aliceCandidate);

  assert.ok(as(alice, () => getCandidateDetail(aliceCandidate)));
  assert.equal(as(bob, () => getCandidateDetail(aliceCandidate)), null, 'Bob must not read Alice’s candidate');

  const aliceJob = as(alice, () => {
    const company = createCompany({ name: 'Acme' });
    return createJob({ company_id: company.id, title: 'Java Dev', required_skills: ['Java'] }).id;
  });
  // Company names are unique per workspace, not globally.
  assert.doesNotThrow(() => as(bob, () => createCompany({ name: 'Acme' })));
  assert.throws(() => as(bob, () => addApplication(bobUpsert.id, aliceJob)), /Job not found/);

  const detail = as(alice, () => getCandidateDetail(aliceCandidate));
  assert.equal(detail.events[0].actor, 'Alice Shah', 'events record who acted');
});

test('clearing a workspace removes only that workspace’s data', async () => {
  const { clearWorkspace } = await import('../src/services.js');
  const carol = createAccount({ name: 'Carol Das', email: 'carol@agency-c.com' });
  const dev = createAccount({ name: 'Dev Patel', email: 'dev@agency-d.com' });
  const resume = parseResume('Arjun Mehta\narjun@example.com\nPython, Django, AWS. 5 years of experience.');
  as(carol, () => {
    upsertCandidate(resume);
    createJob({ company_id: createCompany({ name: 'Nimbus' }).id, title: 'Python Dev', required_skills: ['Python'] });
  });
  const devCandidate = as(dev, () => upsertCandidate(resume).id);

  const result = as(carol, () => clearWorkspace());
  assert.deepEqual({ ...result, files: undefined }, { candidates: 1, jobs: 1, companies: 1, files: undefined });
  assert.ok(as(dev, () => getCandidateDetail(devCandidate)), 'other workspaces are untouched');
});
