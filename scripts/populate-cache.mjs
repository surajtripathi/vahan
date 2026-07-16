#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createInterface } from 'readline/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.env.CACHE_DIR = join(__dirname, '..', 'client', 'public', 'cache');

const { fetchData, fetchRtoList, saveYearFile, saveRtoFile } = await import('../server/src/vahan-scraper.js');
const { STATES } = await import('../server/src/constants.js');

const DRY = process.argv.includes('--dry');
const START_YEAR = 2003;
const currentYear = new Date().getFullYear();
const Y_AXIS = ['Vehicle Category', 'Maker', 'Fuel Type'];

// ── helpers ──────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => rl.question(q);

function validateYear(input) {
  const y = parseInt(input.trim(), 10);
  if (isNaN(y) || y < START_YEAR || y > currentYear) return null;
  return y;
}

async function askYear(label) {
  while (true) {
    const input = await ask(`  ${label} (${START_YEAR}–${currentYear}): `);
    const y = validateYear(input);
    if (y !== null) return y;
    console.log(`  ✗ Enter a year between ${START_YEAR} and ${currentYear}`);
  }
}

async function askChoice(prompt, options) {
  const lines = options.map((o, i) => `  ${i + 1}) ${o}`).join('\n');
  while (true) {
    const input = await ask(`${prompt}\n${lines}\n> `);
    const n = parseInt(input.trim(), 10);
    if (n >= 1 && n <= options.length) return n - 1;
    console.log(`  ✗ Enter a number between 1 and ${options.length}`);
  }
}

// ── interactive prompts ───────────────────────────────────────────────────────

console.log('\n── Vahan Cache Populator ─────────────────────────────────────\n');

const whatIdx = await askChoice('What do you want to refresh?', [
  'Sales data',
  'RTO data',
  'Both',
]);
const doData = whatIdx !== 1;
const doRto  = whatIdx !== 0;

let years = [];
if (doData) {
  console.log();
  const yearMode = await askChoice('Year selection?', [
    'Single year',
    'Year range',
    `All years (${START_YEAR}–${currentYear})`,
  ]);

  if (yearMode === 0) {
    console.log();
    const y = await askYear('Year');
    years = [String(y)];
  } else if (yearMode === 1) {
    console.log();
    let start, end;
    start = await askYear('Start year');
    do {
      end = await askYear('End year');
      if (end < start) console.log(`  ✗ End year must be ≥ start year (${start})`);
    } while (end < start);
    years = Array.from({ length: end - start + 1 }, (_, i) => String(start + i));
  } else {
    years = Array.from({ length: currentYear - START_YEAR + 1 }, (_, i) => String(START_YEAR + i));
  }
}

// ── build query list ──────────────────────────────────────────────────────────

const dataQueries = [];
for (const year of years) {
  for (const yAxis of Y_AXIS) {
    dataQueries.push({ state: '-1', rto: '-1', yAxis, xAxis: 'Month Wise', yearType: 'C', year, vehicleCategories: [], fuelTypes: [] });
    dataQueries.push({ state: '-1', rto: '-1', yAxis, xAxis: 'Calendar Year', years: [year], vehicleCategories: [], fuelTypes: [] });
  }
}
const rtoStateCodes = doRto ? STATES.filter(s => s.code !== '-1').map(s => s.code) : [];

// ── summary + confirm ─────────────────────────────────────────────────────────

console.log('\n──────────────────────────────────────────────────────────────');
if (doData) console.log(`  Sales data: ${years.join(', ')}  (${dataQueries.length} queries)`);
if (doRto)  console.log(`  RTO data:   ${rtoStateCodes.length} states`);
console.log('──────────────────────────────────────────────────────────────');

if (DRY) {
  console.log('\n[dry run] would fetch the above — exiting\n');
  rl.close();
  process.exit(0);
}

const confirm = await ask('\nProceed? (y/n): ');
rl.close();
if (confirm.trim().toLowerCase() !== 'y') {
  console.log('Cancelled.');
  process.exit(0);
}

// ── fetch ─────────────────────────────────────────────────────────────────────

console.log();
let ok = 0, fail = 0;

for (const [i, filters] of dataQueries.entries()) {
  const yearLabel = filters.year ?? filters.years?.join(',');
  const label = `[data ${String(i + 1).padStart(3)}/${dataQueries.length}] ${yearLabel} | ${filters.yAxis} | ${filters.xAxis}`;
  try {
    process.stdout.write(`${label} ... `);
    const result = await fetchData(filters);
    saveYearFile(filters.year ?? filters.years?.[0]);
    console.log(`${result.rows?.length ?? 0} rows${result.cached ? ' (cached)' : ''}`);
    ok++;
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
    fail++;
  }
  await new Promise(r => setTimeout(r, 1500));
}

for (const [i, code] of rtoStateCodes.entries()) {
  const state = STATES.find(s => s.code === code);
  const label = `[rto  ${String(i + 1).padStart(3)}/${rtoStateCodes.length}] ${code} (${state?.name})`;
  try {
    process.stdout.write(`${label} ... `);
    const list = await fetchRtoList(code);
    saveRtoFile();
    console.log(`${list.length} RTOs`);
    ok++;
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
    fail++;
  }
  await new Promise(r => setTimeout(r, 1500));
}

console.log(`\nDone: ${ok} ok, ${fail} failed`);
console.log(`\nCommit the cache:`);
console.log(`  git add client/public/cache/`);
console.log(`  git commit -m "chore: update cache"`);
console.log(`  git push`);
