import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-int-rounds-'));
process.env.DB_PATH = ':memory:';

const { createAccount } = await import('../src/auth.js');
const { runAs } = await import('../src/context.js');
const { parseResume } = await import('../src/parser.js');
const S = await import('../src/services.js');

const as = (user, fn) => runAs({ workspaceId: user.workspace_id, user: { id: user.id, name: user.name } }, fn);
const owner = createAccount({ name: 'Meera Nair', email: 'meera@t3cogno.example' });
const other = createAccount({ name: 'Other Agency', email: 'ops@other.example' });

function setup(rounds) {
  return as(owner, () => {
    const company = S.createCompany({ name: `Client ${Math.random()}` });
    const job = S.createJob({ company_id: company.id, title: 'Staff Nurse', required_skills: ['Patient Care'], rounds });
    const cand = S.upsertCandidate(parseResume(`Asha ${Math.random()}\nasha${Math.random()}@example.com\nPatient care, 3 years of experience.`)).id;
    const app = S.addApplication(cand, job.id);
    return { job: S.getJob(job.id), app, cand };
  });
}

test('rounds: sensible default, custom lists cleaned, bad lists refused', () => {
  assert.deepEqual(S.validateRounds(undefined), ['Screening', 'Technical', 'HR Round']);
  assert.deepEqual(S.validateRounds([' Phone  call ', 'Final interview', '']), ['Phone call', 'Final interview']);
  assert.throws(() => S.validateRounds(['Interview', 'interview']), /listed twice/);
  assert.throws(() => S.validateRounds(['Offer']), /added automatically/);
  assert.throws(() => S.validateRounds([]), /at least one/);
  assert.throws(() => S.validateRounds(Array.from({ length: 11 }, (_, i) => `R${i}`)), /at most 10/);
});

test('a one-round job has exactly that pipeline', () => {
  const { job, app } = setup(['Final interview']);
  assert.deepEqual(job.stages, ['Applied', 'Final interview', 'Offer', 'Hired', 'Rejected']);
  as(owner, () => {
    assert.throws(() => S.moveStage(app.id, 'Technical'), /stage must be one of/);
    assert.equal(S.moveStage(app.id, 'Final interview').stage, 'Final interview');
  });
});

test('scheduling an interview records date/time and moves the candidate to that round', () => {
  const { app } = setup(['Phone call', 'Skills test', 'Manager interview']);
  const when = '2026-10-05T05:30:00.000Z';
  const iv = as(owner, () => S.scheduleInterview({ application_id: app.id, round: 'Skills test', scheduled_at: when, duration_minutes: 45, location: 'Office, 2nd floor' }));
  assert.equal(iv.status, 'scheduled');
  assert.equal(iv.scheduled_at, when);
  assert.equal(iv.interviewer, 'Meera Nair', 'defaults to the signed-in user');
  assert.equal(as(owner, () => S.getApplication(app.id)).stage, 'Skills test');

  // An earlier round never moves the candidate backwards.
  as(owner, () => S.scheduleInterview({ application_id: app.id, round: 'Phone call', scheduled_at: when }));
  assert.equal(as(owner, () => S.getApplication(app.id)).stage, 'Skills test');

  assert.throws(() => as(owner, () => S.scheduleInterview({ application_id: app.id, round: 'HR Round', scheduled_at: when })), /this job's rounds/);
  assert.throws(() => as(owner, () => S.scheduleInterview({ application_id: app.id, round: 'Skills test', scheduled_at: 'tomorrow-ish' })), /valid date/);
});

test('marking an interview finished stores when it finished and logs it', () => {
  const { app, cand } = setup(['Interview']);
  const iv = as(owner, () => S.scheduleInterview({ application_id: app.id, round: 'Interview', scheduled_at: '2026-10-02T09:00:00Z' }));
  const done = as(owner, () => S.updateInterview(iv.id, { status: 'completed', completed_at: '2026-10-02T09:50:00Z' }));
  assert.equal(done.status, 'completed');
  assert.equal(done.completed_at, '2026-10-02T09:50:00.000Z');
  const detail = as(owner, () => S.getCandidateDetail(cand));
  assert.equal(detail.interviews[0].status, 'completed');
  assert.match(detail.events[0].message, /Interview interview for Staff Nurse finished/);
  assert.deepEqual(detail.applications[0].stages, ['Applied', 'Interview', 'Offer', 'Hired', 'Rejected']);
});

test('upcoming list shows only scheduled future interviews, soonest first', () => {
  const { app } = setup(['A', 'B']);
  const soon = new Date(Date.now() + 3600_000).toISOString();
  const later = new Date(Date.now() + 86_400_000).toISOString();
  as(owner, () => {
    S.scheduleInterview({ application_id: app.id, round: 'B', scheduled_at: later });
    S.scheduleInterview({ application_id: app.id, round: 'A', scheduled_at: soon });
    const past = S.scheduleInterview({ application_id: app.id, round: 'A', scheduled_at: '2020-01-01T00:00:00Z' });
    assert.ok(!S.listInterviews({ upcoming: true }).some((i) => i.id === past.id));
  });
  const up = as(owner, () => S.listInterviews({ upcoming: true })).filter((i) => i.application_id === app.id);
  assert.deepEqual(up.map((i) => i.round), ['A', 'B']);
});

test('another workspace cannot see or schedule on this application', () => {
  const { app } = setup(['Interview']);
  assert.throws(() => as(other, () => S.scheduleInterview({ application_id: app.id, round: 'Interview', scheduled_at: '2026-10-02T09:00:00Z' })), /Application not found/);
  assert.equal(as(other, () => S.listInterviews({})).length, 0);
});

test('a round with candidates in it cannot be removed', () => {
  const { job, app } = setup(['Screening', 'Technical']);
  as(owner, () => S.moveStage(app.id, 'Technical'));
  assert.throws(() => as(owner, () => S.updateRounds(job, ['Screening'])), /still in "Technical"/);
  assert.deepEqual(as(owner, () => S.updateRounds(job, ['Screening', 'Technical', 'Final'])), ['Screening', 'Technical', 'Final']);
});
