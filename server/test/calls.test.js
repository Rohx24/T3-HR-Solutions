import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-int-calls-'));
process.env.DB_PATH = ':memory:';
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;

const { createAccount } = await import('../src/auth.js');
const { runAs } = await import('../src/context.js');
const { parseResume } = await import('../src/parser.js');
const { UPLOAD_DIR, db } = await import('../src/db.js');
const S = await import('../src/services.js');
const C = await import('../src/calls.js');
const F = await import('../src/feedback.js');

const hr = createAccount({ name: 'Lakshmi K', email: 'lakshmi@t3cogno.example' });
const as = (fn) => runAs({ workspaceId: hr.workspace_id, user: { id: hr.id, name: hr.name } }, fn);
const newCandidate = () =>
  as(() => S.upsertCandidate(parseResume(`Ravi Teja\nravi.${Math.random()}@example.com\nHyderabad\nJava, Spring Boot. 4 years of experience.`)).id);

// 0.2 s of silent 16-bit mono WAV: enough for ffmpeg (or the pass-through path) to handle.
function wavFile() {
  const samples = 3200;
  const b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples * 2, 40);
  const name = `call-test-${Math.random().toString(36).slice(2)}.wav`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), b);
  return name;
}

const INSIGHTS = {
  summary: 'Ravi is interested in the Java role, serving 30 days notice, expects 9 LPA.',
  key_points: ['Currently at Infosys', 'Open to Bengaluru'], interest_level: 'Very interested',
  current_company: 'Infosys', current_title: 'Senior Engineer', total_experience_years: 4.5,
  current_ctc: '7 LPA', expected_ctc: '9 LPA', notice_period: '30 days', can_join_by: '15 Nov',
  current_location: 'Hyderabad', preferred_locations: ['Bengaluru', 'Hyderabad'], willing_to_relocate: true,
  reason_for_change: 'Growth', availability_for_interview: 'Weekdays after 6 pm', skills_mentioned: ['Kafka'],
  languages: ['Telugu', 'English'], concerns: [], follow_up_actions: ['Send JD on WhatsApp'], hr_comments: 'Good communication',
};

function mockOpenAI(calls = [], { failTranscribe = false } = {}) {
  return async (url, init) => {
    calls.push(url);
    if (url.endsWith('/audio/transcriptions')) {
      if (failTranscribe) return new Response('{"error":"bad audio"}', { status: 400 });
      assert.equal(init.body.get('model'), 'gpt-4o-transcribe');
      assert.match(init.body.get('prompt'), /notice period/);
      return Response.json({ text: 'Hi Ravi, this is Lakshmi from T3Cogno... my notice period is 30 days, expecting 9 LPA.' });
    }
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gpt-4o-mini');
    assert.equal(body.response_format.json_schema.strict, true);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(INSIGHTS) } }] });
  };
}

test('typed call notes without AI are saved immediately', () => {
  const cand = newCandidate();
  const id = as(() => C.createCall({ candidateId: cand, method: 'typed', notes: 'Spoke to Ravi, 30 days notice.' }));
  const call = as(() => C.getCallScoped(id));
  assert.equal(call.status, 'done');
  assert.equal(call.notes, 'Spoke to Ravi, 30 days notice.');
  assert.throws(() => as(() => C.createCall({ candidateId: cand, method: 'typed', notes: '  ' })), /recording or type some notes/);
});

test('a recorded call is transcribed, summarised and updates the profile', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  try {
    const cand = newCandidate();
    const id = as(() => C.createCall({ candidateId: cand, method: 'recorded', audioFile: wavFile(), audioName: 'Live recording' }));
    const seen = [];
    await as(() => C.processCall(id, { fetchImpl: mockOpenAI(seen) }));
    const call = C.toCall(as(() => C.getCallScoped(id)));
    assert.equal(call.status, 'done', call.error);
    assert.match(call.transcript, /notice period is 30 days/);
    assert.equal(call.summary, INSIGHTS.summary);
    assert.ok(call.insights.updated_fields.includes('expected_ctc'));
    assert.ok(seen.some((u) => u.endsWith('/audio/transcriptions')) && seen.some((u) => u.endsWith('/chat/completions')));

    const detail = as(() => S.getCandidateDetail(cand));
    assert.equal(detail.profile.notice_period, '30 days');
    assert.equal(detail.profile.expected_ctc, '9 LPA');
    assert.equal(detail.profile.last_call.interest_level, 'Very interested');
    assert.equal(detail.years_experience, 4.5);
    assert.ok(detail.skills.includes('Kafka'));
    assert.equal(detail.calls[0].id, id);
    assert.match(detail.events[0].message, /Call summarised/);
  } finally {
    delete process.env.OPENAI_API_KEY;
  }
});

test('a failed transcription is marked failed with a reason (and can be retried)', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  try {
    const cand = newCandidate();
    const id = as(() => C.createCall({ candidateId: cand, method: 'uploaded', audioFile: wavFile(), audioName: 'call.wav' }));
    await as(() => C.processCall(id, { fetchImpl: mockOpenAI([], { failTranscribe: true }) }));
    const call = as(() => C.getCallScoped(id));
    assert.equal(call.status, 'failed');
    assert.match(call.error, /Transcription failed \(400\)/);
  } finally {
    delete process.env.OPENAI_API_KEY;
  }
});

test('feedback link: interviewer sees only basics, submits once, interview is marked finished', () => {
  const cand = newCandidate();
  const { iv, company } = as(() => {
    const co = S.createCompany({ name: 'Acme Fintech' });
    const job = S.createJob({ company_id: co.id, title: 'Java Developer', required_skills: ['Java'], rounds: ['Client interview'] });
    const app = S.addApplication(cand, job.id);
    return { iv: S.scheduleInterview({ application_id: app.id, round: 'Client interview', scheduled_at: '2026-10-06T06:00:00Z' }), company: co };
  });
  const { token, path: url } = as(() => F.createFeedbackLink(iv.id, 'Lakshmi K'));
  assert.match(url, /^\/feedback\/[\w-]{20,}$/);

  const info = F.readFeedbackLink(token);
  assert.deepEqual(Object.keys(info).sort(), ['candidate_name', 'company_name', 'expired', 'job_title', 'primary_role', 'round', 'scheduled_at', 'submitted']);
  assert.equal(info.round, 'Client interview');
  assert.equal(info.company_name, company.name);

  assert.throws(() => F.submitFeedback(token, { evaluator_name: 'Arun (Acme)', decision: 'Maybe', comments: 'ok' }), /choose a result/);
  F.submitFeedback(token, { evaluator_name: 'Arun (Acme)', rating: 4, decision: 'Passed', comments: 'Strong Java basics.' });
  assert.throws(() => F.submitFeedback(token, { evaluator_name: 'Arun', decision: 'Passed', comments: 'again' }), /already been submitted/);
  assert.throws(() => F.readFeedbackLink('not-a-real-token'), /not valid/);

  const detail = as(() => S.getCandidateDetail(cand));
  const note = detail.notes[0];
  assert.equal(note.decision, 'Passed');
  assert.equal(note.evaluator_company, 'Acme Fintech');
  assert.equal(note.author, 'Arun (Acme)');
  assert.equal(detail.interviews[0].status, 'completed');
});

test('expired feedback links are refused', () => {
  const cand = newCandidate();
  const iv = as(() => {
    const co = S.createCompany({ name: 'Nimbus Health' });
    const job = S.createJob({ company_id: co.id, title: 'Nurse', required_skills: ['Patient Care'], rounds: ['Interview'] });
    return S.scheduleInterview({ application_id: S.addApplication(cand, job.id).id, round: 'Interview', scheduled_at: '2026-10-06T06:00:00Z' });
  });
  const { token } = as(() => F.createFeedbackLink(iv.id));
  db.prepare("UPDATE feedback_links SET expires_at = '2020-01-01T00:00:00.000Z'").run();
  assert.equal(F.readFeedbackLink(token).expired, true);
  assert.throws(() => F.submitFeedback(token, { evaluator_name: 'X', decision: 'Passed', comments: 'ok' }), /expired/);
});

test('candidate source is stored and editable', () => {
  const cand = newCandidate();
  as(() => S.updateCandidateSource(cand, { source: 'Referral', source_detail: 'Referred by Priya (Infosys)' }));
  const d = as(() => S.getCandidateDetail(cand));
  assert.equal(d.source, 'Referral');
  assert.equal(d.source_detail, 'Referred by Priya (Infosys)');
});
