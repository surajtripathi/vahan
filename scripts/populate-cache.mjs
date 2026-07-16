#!/usr/bin/env node
/**
 * Run locally to pre-populate server/.cache/ with historical data and
 * RTO lists. Commit the cache files to GitHub so Railway serves them
 * on boot without live scraping.
 *
 * Usage:
 *   node scripts/populate-cache.mjs               # all historical years + all RTOs
 *   node scripts/populate-cache.mjs --year 2024   # single year only (skips RTOs)
 *   node scripts/populate-cache.mjs --rto-only    # only fetch RTO lists
 *   node scripts/populate-cache.mjs --dry         # print queries, no network
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Must be set before vahan-scraper.js loads (CACHE_DIR is read at module init time)
const __dirname = dirname(fileURLToPath(import.meta.url));
process.env.CACHE_DIR = join(__dirname, '..', 'client', 'public', 'cache');

const { fetchData, fetchRtoList, saveYearFile, saveRtoFile } = await import('../server/src/vahan-scraper.js');
import { STATES } from '../server/src/constants.js';

const args = process.argv.slice(2);
const DRY      = args.includes('--dry');
const onlyYear = args.includes('--year')     ? args[args.indexOf('--year') + 1] : null;
const rtoOnly  = args.includes('--rto-only');

const now = new Date();
const currentYear = now.getFullYear();

// Include current year — data changes monthly but Railway can't scrape live
const START_YEAR = 2003;
const historicalYears = onlyYear
  ? [onlyYear]
  : Array.from({ length: currentYear - START_YEAR + 1 }, (_, i) => String(START_YEAR + i));

const Y_AXIS = ['Vehicle Category', 'Maker', 'Fuel Type'];

// --- Data queries ---
const dataQueries = [];
if (!rtoOnly) {
  for (const year of historicalYears) {
    for (const yAxis of Y_AXIS) {
      dataQueries.push({ state: '-1', rto: '-1', yAxis, xAxis: 'Month Wise', yearType: 'C', year, vehicleCategories: [], fuelTypes: [] });
      dataQueries.push({ state: '-1', rto: '-1', yAxis, xAxis: 'Calendar Year', years: [year], vehicleCategories: [], fuelTypes: [] });
    }
  }
}

// --- RTO queries (all states except All India) ---
const rtoStateCodes = onlyYear ? [] : STATES.filter(s => s.code !== '-1').map(s => s.code);

console.log(`\nPopulating cache (dry=${DRY})`);
if (!rtoOnly) console.log(`  ${dataQueries.length} data queries across ${historicalYears.length} year(s)`);
if (rtoStateCodes.length) console.log(`  ${rtoStateCodes.length} RTO queries (one per state)`);
console.log();

if (DRY) {
  for (const q of dataQueries) console.log('DATA', JSON.stringify(q));
  for (const code of rtoStateCodes) console.log('RTO ', code);
  process.exit(0);
}

let ok = 0, fail = 0;

// Fetch data
for (const [i, filters] of dataQueries.entries()) {
  const yearLabel = filters.year ?? filters.years?.join(',');
  const label = `[data ${i + 1}/${dataQueries.length}] ${yearLabel} | ${filters.yAxis} | ${filters.xAxis}`;
  try {
    process.stdout.write(`${label} ... `);
    const result = await fetchData(filters);
    const yearLabel2 = filters.year ?? filters.years?.join(',');
    if (!result.cached) saveYearFile(yearLabel2);
    console.log(`${result.rows?.length ?? 0} rows${result.cached ? ' (cached)' : ''}`);
    ok++;
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
    fail++;
  }
  await new Promise(r => setTimeout(r, 1500));
}

// Fetch RTOs
for (const [i, code] of rtoStateCodes.entries()) {
  const state = STATES.find(s => s.code === code);
  const label = `[rto  ${i + 1}/${rtoStateCodes.length}] ${code} (${state?.name})`;
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
console.log(`  git add server/.cache/`);
console.log(`  git commit -m "chore: update historical cache"`);
console.log(`  git push`);
