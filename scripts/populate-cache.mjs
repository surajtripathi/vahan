#!/usr/bin/env node
/**
 * Run locally to pre-populate server/.cache/<year>.json files with
 * historical data. Commit the cache files to GitHub so Railway serves
 * them on boot without live scraping.
 *
 * Usage:
 *   node scripts/populate-cache.js              # all historical years
 *   node scripts/populate-cache.js --year 2024  # single year only
 *   node scripts/populate-cache.js --state MH   # also fetch a state
 *   node scripts/populate-cache.js --dry        # print queries, no network
 */

import { fetchData } from '../server/src/vahan-scraper.js';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const extraState = args.includes('--state') ? args[args.indexOf('--state') + 1] : null;
const onlyYear  = args.includes('--year')  ? args[args.indexOf('--year')  + 1] : null;

const now = new Date();
const currentYear = now.getFullYear();

const historicalYears = onlyYear
  ? [onlyYear]
  : Array.from({ length: currentYear - 2018 }, (_, i) => String(2018 + i));

const Y_AXIS = ['Vehicle Category', 'Maker', 'Fuel Type'];
const STATES = ['-1', ...(extraState ? [extraState] : [])];

const queries = [];

for (const year of historicalYears) {
  for (const state of STATES) {
    for (const yAxis of Y_AXIS) {
      // Month-wise summary for the year
      queries.push({ state, rto: '-1', yAxis, xAxis: 'Month Wise', yearType: 'C', year, vehicleCategories: [], fuelTypes: [] });
      // Calendar year rollup
      queries.push({ state, rto: '-1', yAxis, xAxis: 'Calendar Year', years: [year], vehicleCategories: [], fuelTypes: [] });
    }
  }
}

console.log(`\nPopulating cache — ${queries.length} queries across ${historicalYears.length} year(s) (dry=${DRY})\n`);
if (onlyYear) console.log(`  → will write server/.cache/${onlyYear}.json\n`);
else console.log(`  → will write server/.cache/{year}.json for each year\n`);

if (DRY) {
  for (const q of queries) console.log(JSON.stringify(q));
  process.exit(0);
}

let ok = 0, fail = 0;

for (const [i, filters] of queries.entries()) {
  const yearLabel = filters.year ?? filters.years?.join(',');
  const label = `[${i + 1}/${queries.length}] ${yearLabel} | ${filters.yAxis} | ${filters.xAxis} | state=${filters.state}`;
  try {
    process.stdout.write(`${label} ... `);
    const result = await fetchData(filters);
    console.log(`${result.rows?.length ?? 0} rows${result.cached ? ' (cached)' : ''}`);
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
