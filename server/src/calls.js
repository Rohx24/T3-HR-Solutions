// Candidate phone calls -> transcript -> structured details on the candidate's profile.
//
//   1. Audio (live browser recording, or an uploaded phone recording in any format: m4a, mp3, amr,
//      3gp, wav, webm...) is converted with ffmpeg to small mono speech audio, split into 20-minute
//      parts if needed (OpenAI's file limit is 25 MB).
//   2. Each part is transcribed with OpenAI gpt-4o-transcribe (OPENAI_TRANSCRIBE_MODEL), with a prompt
//      that primes recruitment vocabulary (CTC, LPA, notice period) and the candidate's name.
//   3. GPT-4o mini reads the transcript (and/or the HR's typed notes) into a strict schema: summary,
//      salary, notice period, availability, interest, concerns, follow-ups, HR comments.
//   4. Newer facts from the call update the candidate's profile; everything is kept on the call.
// Processing runs in the background so a long recording never blocks the request.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { db, now, HttpError, UPLOAD_DIR, parseList } from './db.js';
import { AI_MODEL, aiEnabled } from './aiParser.js';
import { normalizeSkills } from './skills.js';
import { addEvent } from './services.js';
import { workspaceId } from './context.js';
import { invalidateWorkspace } from './cache.js';
import { recordConsent, requireRecordingConsent, RETENTION_DAYS } from './consent.js';

const run = promisify(execFile);
const API_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
export const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
const MAX_PART_BYTES = 24 * 1024 * 1024;
const PASSTHROUGH = ['.mp3', '.m4a', '.mp4', '.mpeg', '.mpga', '.wav', '.webm', '.ogg', '.flac'];

const S = { type: ['string', 'null'] };
const N = { type: ['number', 'null'] };
const LIST = { type: 'array', items: { type: 'string' } };
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

export const CALL_SCHEMA = obj({
  summary: { type: 'string', description: '2 to 4 sentence summary of the call for a recruiter' },
  key_points: { ...LIST, description: 'Important facts from the call, one per item' },
  interest_level: { type: 'string', enum: ['Very interested', 'Interested', 'Unsure', 'Not interested', 'Not discussed'] },
  current_company: S,
  current_title: S,
  total_experience_years: N,
  current_ctc: { ...S, description: 'Current salary as said, e.g. "6 LPA"' },
  expected_ctc: { ...S, description: 'Expected salary as said, e.g. "8 LPA"' },
  notice_period: { ...S, description: 'e.g. "30 days", "Immediate", "Serving notice, last day 15 Oct"' },
  can_join_by: S,
  current_location: S,
  preferred_locations: LIST,
  willing_to_relocate: { type: ['boolean', 'null'] },
  reason_for_change: S,
  availability_for_interview: { ...S, description: 'When the candidate is free for interviews' },
  skills_mentioned: LIST,
  languages: LIST,
  concerns: { ...LIST, description: 'Red flags or concerns raised in the call' },
  follow_up_actions: { ...LIST, description: 'What the recruiter needs to do next' },
  hr_comments: { ...S, description: 'Any extra remarks or opinions the recruiter expressed or typed' },
  recording_consent: {
    type: 'string',
    enum: ['agreed', 'refused', 'not_discussed'],
    description: 'Did the candidate clearly agree, on the call, to it being recorded? not_discussed if recording was never mentioned or there is no transcript',
  },
});

const CALL_PROMPT = `You read recruitment phone calls between an HR recruiter at T3Cogno and a job candidate,
and/or the recruiter's own typed notes about such a call.
Extract the facts into the JSON schema. Rules:
- Only use what was actually said or written. Use null or [] for anything not mentioned. Never guess.
- Write every field in English, translating if the call was in Hindi, Telugu, Malayalam, Tamil, Kannada or another language.
- Keep salary and notice period wording as stated (e.g. "6.5 LPA", "60 days negotiable").
- Do not record age, religion, caste, marital status, health or other personal attributes.
- recording_consent: "agreed" only if the recruiter mentioned the recording and the candidate clearly said yes (usually at the start).`;

// ---------- audio ----------

async function ffmpegAvailable() {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

// Returns a list of audio parts ready for transcription (each under the API size limit).
async function prepareAudio(file) {
  const ext = path.extname(file).toLowerCase();
  if (!(await ffmpegAvailable())) {
    if (!PASSTHROUGH.includes(ext)) throw new Error(`Cannot convert ${ext} audio on this server (ffmpeg missing)`);
    if (fs.statSync(file).size > MAX_PART_BYTES) throw new Error('Recording is too large to transcribe without ffmpeg');
    return { parts: [file], cleanup: () => {} };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-call-'));
  // Mono, 16 kHz, 32 kbps MP3: clear for speech and about 14 MB per hour.
  const base = ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k'];
  await run('ffmpeg', [...base, '-f', 'segment', '-segment_time', '1200', '-reset_timestamps', '1', path.join(dir, 'part-%03d.mp3')], {
    timeout: 5 * 60_000,
  });
  const parts = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort().map((f) => path.join(dir, f));
  if (!parts.length) throw new Error('The recording has no audio');
  return { parts, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

export async function audioDuration(file) {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
    const s = Math.round(Number(stdout.trim()));
    return Number.isFinite(s) ? s : null;
  } catch {
    return null;
  }
}

async function transcribePart(file, prompt, fetchImpl) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  form.append('model', TRANSCRIBE_MODEL);
  form.append('response_format', 'json');
  if (prompt) form.append('prompt', prompt.slice(0, 800));
  const res = await fetchImpl(`${API_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(5 * 60_000),
  });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).text?.trim() ?? '';
}

export async function transcribe(file, { candidateName, fetchImpl = fetch } = {}) {
  const prompt = `Recruitment phone call between a T3Cogno HR recruiter and ${candidateName || 'a job candidate'}. `
    + 'They discuss current company, experience, CTC and expected CTC in LPA, notice period, location and interview availability.';
  const { parts, cleanup } = await prepareAudio(file);
  try {
    const texts = [];
    for (const part of parts) texts.push(await transcribePart(part, prompt, fetchImpl));
    return texts.filter(Boolean).join('\n');
  } finally {
    cleanup();
  }
}

// ---------- understanding ----------

export async function extractInsights({ transcript, notes, candidateName, jobTitle }, { fetchImpl = fetch } = {}) {
  const parts = [];
  if (candidateName) parts.push(`Candidate: ${candidateName}`);
  if (jobTitle) parts.push(`Job discussed: ${jobTitle}`);
  if (transcript) parts.push(`Call transcript:\n${transcript.slice(0, 60_000)}`);
  if (notes) parts.push(`Recruiter's typed notes:\n${notes.slice(0, 10_000)}`);
  const res = await fetchImpl(`${API_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0,
      max_tokens: 3000,
      response_format: { type: 'json_schema', json_schema: { name: 'call', strict: true, schema: CALL_SCHEMA } },
      messages: [
        { role: 'system', content: CALL_PROMPT },
        { role: 'user', content: parts.join('\n\n') },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI summary failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const choice = (await res.json()).choices?.[0];
  if (choice?.message?.refusal) throw new Error('The AI declined to summarise this call');
  return JSON.parse(choice.message.content);
}

// Facts from a call are newer than the resume, so they update the candidate's profile.
export function applyInsights(candidateId, ins, at = now()) {
  const row = db.prepare('SELECT * FROM candidates WHERE id = ? AND workspace_id = ?').get(candidateId, workspaceId());
  if (!row) throw new HttpError(404, 'Candidate not found');
  let profile = {};
  try {
    profile = row.profile ? JSON.parse(row.profile) : {};
  } catch {
    profile = {};
  }
  const updated = [];
  const take = (key, value) => {
    if (value === null || value === undefined || (Array.isArray(value) && !value.length) || value === '') return;
    if (JSON.stringify(profile[key]) !== JSON.stringify(value)) updated.push(key);
    profile[key] = value;
  };
  take('current_company', ins.current_company);
  take('current_title', ins.current_title);
  take('current_ctc', ins.current_ctc);
  take('expected_ctc', ins.expected_ctc);
  take('notice_period', ins.notice_period);
  take('preferred_locations', ins.preferred_locations);
  take('willing_to_relocate', ins.willing_to_relocate);
  take('languages', [...new Set([...(profile.languages || []), ...(ins.languages || [])])]);
  profile.last_call = { at, interest_level: ins.interest_level, can_join_by: ins.can_join_by, availability: ins.availability_for_interview };

  const skills = normalizeSkills([...parseList(row.skills), ...(ins.skills_mentioned || [])]);
  const years = typeof ins.total_experience_years === 'number' ? ins.total_experience_years : row.years_experience;
  const location = ins.current_location || row.location;
  db.prepare('UPDATE candidates SET profile = ?, skills = ?, years_experience = ?, location = ? WHERE id = ?')
    .run(JSON.stringify(profile), JSON.stringify(skills), years, location, candidateId);
  return updated;
}

// ---------- calls ----------

const CALL_COLUMNS = `id, candidate_id, application_id, method, channel, consent_basis, consent_heard, audio_deleted_at, audio_name, duration_seconds, notes, transcript, summary,
  insights, status, error, recorded_by, created_at, (audio_file IS NOT NULL) AS has_audio`;

export const toCall = (r) => r && ({ ...r, has_audio: Boolean(r.has_audio), insights: r.insights ? JSON.parse(r.insights) : null });

export function listCalls(candidateId) {
  return db.prepare(`SELECT ${CALL_COLUMNS} FROM calls WHERE candidate_id = ? ORDER BY created_at DESC, id DESC`).all(candidateId).map(toCall);
}

export function getCallScoped(id) {
  const row = db.prepare(`
    SELECT ca.*, (ca.audio_file IS NOT NULL) AS has_audio FROM calls ca JOIN candidates c ON c.id = ca.candidate_id
    WHERE ca.id = ? AND c.workspace_id = ?
  `).get(id, workspaceId());
  return row ?? null;
}

export function createCall({ candidateId, applicationId, method, channel, audioFile, audioName, notes, recordedBy, consentBasis }, at = now()) {
  const cand = db.prepare('SELECT id FROM candidates WHERE id = ? AND workspace_id = ?').get(candidateId, workspaceId());
  if (!cand) throw new HttpError(404, 'Candidate not found');
  if (applicationId) {
    const app = db.prepare('SELECT 1 FROM applications WHERE id = ? AND candidate_id = ?').get(applicationId, candidateId);
    if (!app) throw new HttpError(400, 'That job is not linked to this candidate');
  }
  const text = notes ? String(notes).trim().slice(0, 20_000) : null;
  if (!audioFile && !text) throw new HttpError(400, 'Add a recording or type some notes about the call');
  if (audioFile) requireRecordingConsent(candidateId, consentBasis);
  // Nothing to wait for when there is no audio and no AI: save the notes straight away.
  const status = audioFile || aiEnabled() ? 'processing' : 'done';
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO calls (candidate_id, application_id, method, channel, consent_basis, audio_file, audio_name, notes, status, recorded_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(candidateId, applicationId || null, method, channel === 'whatsapp' ? 'whatsapp' : 'phone', audioFile ? consentBasis : null, audioFile ?? null, audioName ?? null, text, status, recordedBy ?? null, at, at);
  const id = Number(lastInsertRowid);
  if (audioFile && consentBasis === 'verbal') recordConsent(candidateId, { status: 'granted', method: 'verbal', recordedBy, callId: id }, at);
  if (status === 'done') addEvent(candidateId, 'call', 'Call notes added', at);
  return id;
}

// Background step: transcript -> insights -> profile. Must run inside the request's workspace context.
export async function processCall(id, { fetchImpl = fetch } = {}) {
  const call = getCallScoped(id);
  if (!call) return;
  const cand = db.prepare('SELECT name FROM candidates WHERE id = ?').get(call.candidate_id);
  const job = call.application_id
    ? db.prepare('SELECT j.title FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?').get(call.application_id)
    : null;
  const set = (fields) => {
    const keys = Object.keys(fields);
    db.prepare(`UPDATE calls SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .run(...keys.map((k) => fields[k]), now(), id);
  };
  try {
    let transcript = null;
    if (call.audio_file) {
      const file = path.join(UPLOAD_DIR, path.basename(call.audio_file));
      set({ duration_seconds: await audioDuration(file) });
      if (!aiEnabled()) {
        set({ status: 'done', error: 'Recording saved. Add an OpenAI API key on the server to get a transcript and summary.' });
        addEvent(call.candidate_id, 'call', 'Call recording saved');
        return;
      }
      transcript = await transcribe(file, { candidateName: cand?.name, fetchImpl });
      set({ transcript });
    }
    if (!aiEnabled()) return set({ status: 'done' });
    const insights = await extractInsights({ transcript, notes: call.notes, candidateName: cand?.name, jobTitle: job?.title }, { fetchImpl });
    const updated = applyInsights(call.candidate_id, insights);
    const consentHeard = transcript ? insights.recording_consent ?? null : null;
    set({ insights: JSON.stringify({ ...insights, updated_fields: updated }), summary: insights.summary, status: 'done', error: null, consent_heard: consentHeard });
    addEvent(call.candidate_id, 'call', `Call summarised${updated.length ? `; updated ${updated.join(', ').replace(/_/g, ' ')}` : ''}`);
    if (call.consent_basis === 'verbal' && consentHeard && consentHeard !== 'agreed') {
      addEvent(call.candidate_id, 'consent', `Check this call: the recruiter confirmed consent, but the AI did not hear the candidate agree to recording (${consentHeard.replace('_', ' ')}).`);
    }
    // Notes are taken: the recording itself is no longer needed.
    if (call.audio_file) deleteRecording(call.id, call.audio_file);
  } catch (err) {
    console.warn(`Call ${id} processing failed: ${err.message}`);
    set({ status: 'failed', error: err.message.slice(0, 300) });
  } finally {
    // The result was written outside a request, so refresh this workspace's cached pages.
    await invalidateWorkspace(workspaceId());
  }
}

// Recordings are kept only until notes are taken. These two helpers remove the audio file and mark the call.
function deleteRecording(callId, audioFile, at = now()) {
  fs.rmSync(path.join(UPLOAD_DIR, path.basename(audioFile)), { force: true });
  db.prepare('UPDATE calls SET audio_file = NULL, audio_deleted_at = ? WHERE id = ?').run(at, callId);
}

// Safety net for recordings that were never transcribed (no AI key, repeated failures): delete after the
// retention period whatever happened. Runs on every replica; deleting twice is harmless.
export function purgeOldRecordings(at = new Date()) {
  const cutoff = new Date(at.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
  const old = db.prepare('SELECT id, audio_file FROM calls WHERE audio_file IS NOT NULL AND created_at < ?').all(cutoff);
  for (const c of old) deleteRecording(c.id, c.audio_file, at.toISOString());
  return old.length;
}

// A replica that restarted mid-way leaves calls stuck in "processing"; mark those so they can be retried.
export function failStaleCalls() {
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  db.prepare("UPDATE calls SET status = 'failed', error = 'Processing was interrupted. Press Try again.' WHERE status = 'processing' AND updated_at < ?")
    .run(cutoff);
}
