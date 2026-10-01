// Detailed resume parsing with OpenAI GPT-4o mini (structured outputs), layered on top of the
// deterministic parser in parser.js:
//   - The model fills a strict JSON schema for ANY profession (nurse, accountant, sales, engineer...):
//     summary, every job with dates and highlights, education, skills, tools, certifications/licences,
//     projects, links and more. Missing facts must be null / [], never invented.
//   - Facts that regex gets right (email, phone) are cross-checked against the resume text.
//   - Skills are normalised to the canonical names used by job matching, and merged with the
//     dictionary matches so scoring never gets worse than the rule-based parser.
//   - No OPENAI_API_KEY, a timeout or any API error falls back to the rule-based result.
import { parseResume } from './parser.js';
import { extractSkills, normalizeSkills } from './skills.js';

export const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const API_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 30_000);
const MAX_CHARS = 40_000;

export const aiEnabled = () => Boolean(process.env.OPENAI_API_KEY);

const S = { type: ['string', 'null'] };
const N = { type: ['number', 'null'] };
const LIST = { type: 'array', items: { type: 'string' } };
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

export const ROLE_CATEGORIES = [
  'Engineering & IT', 'Data & Analytics', 'Design & Creative', 'Product & Project Management',
  'Sales & Business Development', 'Marketing & Communications', 'Finance & Accounting', 'Human Resources',
  'Operations & Supply Chain', 'Customer Support', 'Healthcare & Medical', 'Education & Training',
  'Legal & Compliance', 'Administration', 'Manufacturing & Core Engineering', 'Hospitality & Retail', 'Other',
];

export const RESUME_SCHEMA = obj({
  name: { type: 'string', description: 'Full name of the candidate' },
  email: S,
  phone: S,
  location: { ...S, description: 'City (and country if given) where the candidate is based' },
  headline: { ...S, description: 'Short professional headline, e.g. "Staff Nurse, ICU" or "Senior Java Developer, payments"' },
  primary_role: { type: 'string', description: 'Main role or profession as a standard job title, in any field, e.g. "Staff Nurse", "Chartered Accountant", "Sales Executive", "HR Generalist", "Java Developer"' },
  role_category: { type: 'string', enum: ROLE_CATEGORIES },
  seniority: { type: 'string', enum: ['Intern', 'Entry', 'Junior', 'Mid', 'Senior', 'Lead', 'Manager', 'Director', 'Executive'] },
  current_title: S,
  current_company: S,
  total_experience_years: { ...N, description: 'Total professional experience in years (one decimal). Use the stated figure if the resume states one.' },
  industries: { ...LIST, description: 'Industries worked in, e.g. "Healthcare", "Banking", "E-commerce"' },
  summary: { type: 'string', description: '2 to 3 sentence recruiter-facing summary of the candidate, based only on the resume' },
  skills: { ...LIST, description: 'All professional and technical skills for this profession, using standard names (e.g. "Patient Care", "GST Filing", "B2B Sales", "Spring Boot")' },
  tools: { ...LIST, description: 'Software, systems and equipment used, e.g. "Tally ERP", "SAP", "Salesforce", "Excel", "Ventilators"' },
  domain_expertise: { ...LIST, description: 'Areas of specialisation, e.g. "Critical care", "Statutory audit", "Payments"' },
  soft_skills: LIST,
  languages: { ...LIST, description: 'Spoken languages' },
  highest_education: { ...S, description: 'Short name of the highest qualification, e.g. "B.Tech", "B.Sc Nursing", "CA", "MBA"' },
  education: {
    type: 'array',
    items: obj({ degree: S, field: S, institution: S, start_year: S, end_year: S, grade: S }),
  },
  experience: {
    type: 'array',
    description: 'Every job, internship and assignment, most recent first',
    items: obj({
      title: S,
      company: S,
      location: S,
      employment_type: { ...S, description: 'Full-time, Part-time, Contract, Internship, Freelance' },
      start: { ...S, description: 'e.g. "Jan 2022" or "2022"' },
      end: { ...S, description: 'e.g. "Mar 2024", or null if current' },
      is_current: { type: 'boolean' },
      duration_months: N,
      highlights: { ...LIST, description: 'Responsibilities and achievements, one per item, as written in the resume' },
      skills_used: LIST,
    }),
  },
  projects: { type: 'array', items: obj({ name: S, description: S, skills_used: LIST, link: S }) },
  certifications: { type: 'array', description: 'Certifications, licences and registrations', items: obj({ name: S, issuer: S, year: S }) },
  achievements: { ...LIST, description: 'Awards, recognitions and measurable achievements' },
  publications: LIST,
  volunteering: LIST,
  interests: LIST,
  links: obj({ linkedin: S, github: S, portfolio: S, other: LIST }),
  preferred_locations: LIST,
  willing_to_relocate: { type: ['boolean', 'null'] },
  notice_period: S,
  current_ctc: S,
  expected_ctc: S,
});

const SYSTEM_PROMPT = `You are a meticulous resume parser for T3Cogno, an HR services company that recruits for client companies in every
industry: technology, healthcare, finance, sales, operations, HR, education, manufacturing and more.
Extract every detail that is present in the resume into the JSON schema, whatever the profession.
Rules:
- Never invent or infer facts that are not in the resume. Use null for missing values and [] for missing lists.
- Keep wording of highlights faithful to the resume; split bullet points into separate items.
- List experience and education most recent first. Dates as "Mon YYYY" when a month is given, otherwise "YYYY".
- Use standard, canonical names for skills, tools and qualifications.
- primary_role is the candidate's actual profession as a common job title, not limited to technology roles.
- Do not extract age, date of birth, gender, marital status, religion, caste, photo descriptions or other personal attributes.`;

export async function aiParse(text, { apiKey = process.env.OPENAI_API_KEY, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${API_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0,
      max_tokens: 6000,
      response_format: { type: 'json_schema', json_schema: { name: 'resume', strict: true, schema: RESUME_SCHEMA } },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Resume text:\n\n${text.slice(0, MAX_CHARS)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`OpenAI refused: ${choice.message.refusal}`);
  if (choice?.finish_reason === 'length') throw new Error('OpenAI response was truncated');
  return JSON.parse(choice.message.content);
}

const inText = (value, text) => Boolean(value) && text.toLowerCase().includes(String(value).toLowerCase());

// Combine the model's profile with the rule-based parse into the candidate record.
export function mergeParsed(rules, ai, text) {
  const skills = normalizeSkills([...(ai.skills ?? []), ...(ai.tools ?? []), ...extractSkills(text)]);
  return {
    ...rules,
    name: ai.name?.trim() || rules.name,
    // Regex is exact for emails; only accept the model's email if it really appears in the resume.
    email: rules.email || (inText(ai.email, text) ? ai.email.toLowerCase() : null),
    phone: ai.phone || rules.phone,
    location: ai.location || rules.location,
    years_experience: typeof ai.total_experience_years === 'number' ? ai.total_experience_years : rules.years_experience,
    education: ai.highest_education || rules.education,
    primary_role: ai.primary_role?.trim() || rules.primary_role,
    skills: skills.length ? skills : rules.skills,
    profile: ai,
    parsed_by: AI_MODEL,
  };
}

// The parser the upload route uses: AI when configured, rules otherwise or on any failure.
export async function parseResumeSmart(text, options = {}) {
  const rules = { ...parseResume(text), profile: null, parsed_by: 'rules' };
  if (!(options.apiKey ?? process.env.OPENAI_API_KEY)) return rules;
  try {
    return mergeParsed(rules, await aiParse(text, options), text);
  } catch (err) {
    console.warn(`AI resume parsing failed, using rule-based parser: ${err.message}`);
    return { ...rules, parse_warning: 'AI parsing was unavailable, so the basic parser was used.' };
  }
}
