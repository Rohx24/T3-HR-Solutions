// Job description -> a ready-to-review job. The recruiter pastes (or uploads) the client's JD and
// GPT-4o mini fills a strict schema: title, client, location, experience, salary, openings, must-have
// and nice-to-have skills, responsibilities and, if the JD lists them, the interview rounds.
// Nothing is saved here: the result pre-fills the "Create a job" form for the recruiter to check.
// Without an OpenAI key (or if the call fails) a rule-based draft is returned instead.
import { AI_MODEL, aiEnabled } from './aiParser.js';
import { extractSkills, normalizeSkills } from './skills.js';

const API_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MAX_CHARS = 30_000;

const S = { type: ['string', 'null'] };
const N = { type: ['number', 'null'] };
const LIST = { type: 'array', items: { type: 'string' } };
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

export const JD_SCHEMA = obj({
  title: { type: 'string', description: 'Job title as a standard title, e.g. "Senior Java Developer", "ICU Staff Nurse"' },
  company_name: { ...S, description: 'The hiring (client) company, if named' },
  industry: S,
  location: { ...S, description: 'City or cities, e.g. "Bengaluru" or "Pune / Mumbai"' },
  work_mode: { type: 'string', enum: ['On-site', 'Hybrid', 'Remote', 'Not stated'] },
  employment_type: { type: 'string', enum: ['Full-time', 'Part-time', 'Contract', 'Internship', 'Not stated'] },
  experience_min: { ...N, description: 'Minimum years of experience' },
  experience_max: { ...N, description: 'Maximum years of experience' },
  salary: { ...S, description: 'Salary or budget as stated, e.g. "8 to 12 LPA"' },
  openings: { ...N, description: 'Number of positions' },
  required_skills: { ...LIST, description: 'Must-have skills, using standard names' },
  nice_to_have_skills: { ...LIST, description: 'Preferred / good-to-have skills' },
  education: S,
  responsibilities: { ...LIST, description: 'Key responsibilities, one per item, short' },
  interview_rounds: { ...LIST, description: 'Interview rounds only if the JD describes them, in order, e.g. ["Technical", "Managerial", "HR"]. Otherwise []' },
  notice_period: { ...S, description: 'Notice period or joining requirement, e.g. "Immediate to 30 days"' },
  summary: { type: 'string', description: '2 to 3 sentence summary of the role for recruiters' },
});

const PROMPT = `You read job descriptions sent by T3Cogno's client companies and turn them into a job record.
Any industry: technology, healthcare, finance, sales, operations, HR, manufacturing and more.
Rules:
- Only use what the job description says. Use null or [] when something is not stated. Never invent salary, rounds or numbers.
- Use standard names for skills. Put only true must-haves in required_skills; preferences go in nice_to_have_skills.
- Keep salary and notice wording as written.`;

async function aiDraft(text, fetchImpl) {
  const res = await fetchImpl(`${API_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0,
      max_tokens: 3000,
      response_format: { type: 'json_schema', json_schema: { name: 'job', strict: true, schema: JD_SCHEMA } },
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: `Job description:\n\n${text.slice(0, MAX_CHARS)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const choice = (await res.json()).choices?.[0];
  if (choice?.message?.refusal) throw new Error('The AI declined to read this job description');
  return JSON.parse(choice.message.content);
}

// A basic draft when the AI is not available: first meaningful line as the title, dictionary skills.
function ruleDraft(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const title = (lines.find((l) => l.length <= 80 && !/^(about|job description|jd|company|we are)/i.test(l)) || 'New job')
    .replace(/^(job title|position|role)\s*[:-]\s*/i, '');
  return {
    title,
    company_name: null, industry: null, location: null, work_mode: 'Not stated', employment_type: 'Not stated',
    experience_min: null, experience_max: null, salary: null, openings: null,
    required_skills: extractSkills(text), nice_to_have_skills: [], education: null, responsibilities: [],
    interview_rounds: [], notice_period: null, summary: text.slice(0, 400),
  };
}

// Returns { draft, parsed_by, warning? }. Skills are normalised so job matching uses canonical names.
export async function draftJobFromDescription(text, { fetchImpl = fetch } = {}) {
  const clean = String(text ?? '').trim();
  if (clean.length < 40) throw Object.assign(new Error('Paste the full job description (at least a few lines).'), { status: 400 });
  let draft;
  let parsedBy = 'rules';
  let warning;
  if (aiEnabled()) {
    try {
      draft = await aiDraft(clean, fetchImpl);
      parsedBy = AI_MODEL;
    } catch (err) {
      console.warn(`AI job description reading failed, using the basic reader: ${err.message}`);
      warning = 'The AI was unavailable, so only the basics were filled in. Please check every field.';
    }
  }
  draft ??= ruleDraft(clean);
  draft.required_skills = normalizeSkills(draft.required_skills?.length ? draft.required_skills : extractSkills(clean));
  draft.nice_to_have_skills = normalizeSkills(draft.nice_to_have_skills || []).filter((s) => !draft.required_skills.includes(s));
  draft.interview_rounds = (draft.interview_rounds || []).filter((r) => !/^(applied|offer|hired|rejected)$/i.test(r)).slice(0, 10);
  return { draft, parsed_by: parsedBy, ...(warning ? { warning } : {}) };
}

// The extra details stored on a job (everything beyond title, company, skills, description, rounds).
const DETAIL_KEYS = ['location', 'work_mode', 'employment_type', 'experience_min', 'experience_max', 'salary', 'openings',
  'nice_to_have_skills', 'education', 'responsibilities', 'notice_period', 'industry'];

export function cleanJobDetails(input) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const k of DETAIL_KEYS) {
    const v = input[k];
    if (v === undefined || v === null || v === '' || v === 'Not stated') continue;
    if (Array.isArray(v)) {
      const items = v.map((x) => String(x).trim().slice(0, 300)).filter(Boolean).slice(0, 40);
      if (items.length) out[k] = k === 'nice_to_have_skills' ? normalizeSkills(items) : items;
    } else if (typeof v === 'number') {
      if (Number.isFinite(v) && v >= 0 && v < 1000) out[k] = v;
    } else {
      out[k] = String(v).trim().slice(0, 200);
    }
  }
  return Object.keys(out).length ? out : null;
}
