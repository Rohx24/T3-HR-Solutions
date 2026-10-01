import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { extractSkills, detectRole } from './skills.js';

export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'];

export async function extractText(buffer, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  if (ext === '.docx') return (await mammoth.extractRawText({ buffer })).value;
  if (ext === '.txt') return buffer.toString('utf8');
  throw new Error(`Unsupported file type: ${ext}`);
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{4,5}/g;
const YEARS_RE = /(\d{1,2}(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/gi;
const NAME_STOPWORDS = /resume|curriculum|vitae|profile|summary|objective|contact|email|phone|address|developer|engineer|scientist/i;

const CITIES = {
  Bengaluru: /\b(bengaluru|bangalore)\b/i,
  Mumbai: /\bmumbai\b/i,
  Delhi: /\b(new delhi|delhi)\b/i,
  Gurugram: /\b(gurugram|gurgaon)\b/i,
  Noida: /\bnoida\b/i,
  Hyderabad: /\bhyderabad\b/i,
  Chennai: /\bchennai\b/i,
  Pune: /\bpune\b/i,
  Kolkata: /\bkolkata\b/i,
  Ahmedabad: /\bahmedabad\b/i,
  Kochi: /\b(kochi|cochin)\b/i,
  Jaipur: /\bjaipur\b/i,
  Mysuru: /\b(mysuru|mysore)\b/i,
  Coimbatore: /\bcoimbatore\b/i,
  Chandigarh: /\bchandigarh\b/i,
  Remote: /\bremote\b/i,
};

// Highest degree first.
const DEGREES = [
  ['PhD', /\bph\.?\s?d\b|\bdoctorate\b/i],
  ['M.Tech', /\bm\.?\s?tech\b|\bmaster of technology\b/i],
  ['M.E.', /\bm\.e\.|\bmaster of engineering\b/i],
  ['MS', /\bm\.s\.|\bmaster of science\b/i],
  ['MCA', /\bmca\b|\bmaster of computer applications\b/i],
  ['MBA', /\bmba\b|\bmaster of business administration\b/i],
  ['M.Sc', /\bm\.?\s?sc\b/i],
  ['B.Tech', /\bb\.?\s?tech\b|\bbachelor of technology\b/i],
  ['B.E.', /\bb\.e\b|\bbachelor of engineering\b/i],
  ['BCA', /\bbca\b|\bbachelor of computer applications\b/i],
  ['B.Sc', /\bb\.?\s?sc\b|\bbachelor of science\b/i],
  ['B.Com', /\bb\.?\s?com\b/i],
  ['BBA', /\bbba\b/i],
];

const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

function extractName(lines, email) {
  for (const line of lines.slice(0, 8)) {
    const words = line.split(/\s+/);
    if (
      words.length >= 2 && words.length <= 4 && line.length <= 40 &&
      /^[A-Za-z][A-Za-z.' -]+$/.test(line) && !NAME_STOPWORDS.test(line)
    ) {
      return line === line.toUpperCase() ? titleCase(line) : line;
    }
  }
  // Fallback: "priya.sharma@..." -> "Priya Sharma"
  if (email) {
    const local = email.split('@')[0].replace(/\d+/g, '').replace(/[._-]+/g, ' ').trim();
    if (local) return titleCase(local);
  }
  return 'Unknown Candidate';
}

function extractPhone(text) {
  for (const match of text.matchAll(PHONE_RE)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 13) return match[0].trim();
  }
  return null;
}

function extractYears(text) {
  const values = [...text.matchAll(YEARS_RE)].map((m) => parseFloat(m[1])).filter((n) => n > 0 && n <= 40);
  return values.length ? Math.max(...values) : null;
}

function extractLocation(text) {
  const head = text.slice(0, 800);
  for (const scope of [head, text]) {
    for (const [city, re] of Object.entries(CITIES)) if (re.test(scope)) return city;
  }
  return null;
}

function extractEducation(text) {
  return DEGREES.find(([, re]) => re.test(text))?.[0] ?? null;
}

export function parseResume(rawText) {
  const text = rawText.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const email = text.match(EMAIL_RE)?.[0].toLowerCase() ?? null;
  const skills = extractSkills(text);

  return {
    name: extractName(lines, email),
    email,
    phone: extractPhone(text),
    location: extractLocation(text),
    years_experience: extractYears(text),
    education: extractEducation(text),
    skills,
    primary_role: detectRole(skills, text),
    resume_text: text,
  };
}
