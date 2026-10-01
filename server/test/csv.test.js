import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv, CSV_COLUMNS } from '../src/csv.js';

test('csvCell quotes commas, quotes and newlines', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('Bengaluru, KA'), '"Bengaluru, KA"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
});

test('csvCell handles empty values, numbers and skill arrays', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(4.5), '4.5');
  assert.equal(csvCell(['Java', 'Spring Boot']), 'Java; Spring Boot');
});

test('csvCell neutralises spreadsheet formula injection', () => {
  assert.equal(csvCell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`);
  assert.equal(csvCell('+91 98450 12345'), "'+91 98450 12345");
  assert.equal(csvCell('@sum'), "'@sum");
});

test('toCsv writes a header and one row per candidate', () => {
  const csv = toCsv([
    {
      id: 1, name: 'Priya Sharma', email: 'priya@example.com', phone: null, location: 'Bengaluru',
      primary_role: 'Java Developer', years_experience: 4, education: 'B.Tech', skills: ['Java', 'AWS'],
      times_applied: 2, application_count: 1, created_at: '2024-08-12T10:00:00.000Z', last_applied_at: '2026-10-01T09:30:00.000Z',
    },
  ]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].split(',').length, CSV_COLUMNS.length);
  assert.equal(lines[1], '1,Priya Sharma,priya@example.com,,Bengaluru,Java Developer,4,B.Tech,Java; AWS,2,1,2024-08-12T10:00:00.000Z,2026-10-01T09:30:00.000Z');
});

test('toCsv on an empty pool still returns the header', () => {
  assert.equal(toCsv([]).trim(), CSV_COLUMNS.map(([, label]) => label).join(','));
});
