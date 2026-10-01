// Talent-pool CSV export (RFC 4180 quoting, formula-injection safe for Excel/Sheets).

export const CSV_COLUMNS = [
  ['id', 'ID'],
  ['name', 'Name'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['location', 'Location'],
  ['primary_role', 'Primary role'],
  ['years_experience', 'Years of experience'],
  ['education', 'Education'],
  ['skills', 'Skills'],
  ['times_applied', 'Times applied'],
  ['application_count', 'Applications'],
  ['created_at', 'First seen'],
  ['last_applied_at', 'Last applied'],
];

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = Array.isArray(value) ? value.join('; ') : String(value);
  // A leading = + - @ makes spreadsheets evaluate the cell as a formula; neutralise it.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(candidates) {
  const header = CSV_COLUMNS.map(([, label]) => label).join(',');
  const rows = candidates.map((c) => CSV_COLUMNS.map(([key]) => csvCell(c[key])).join(','));
  return [header, ...rows].join('\r\n') + '\r\n';
}
