#!/usr/bin/env node
/**
 * Run locally to pre-populate server/.cache/historical.json with data
 * up to (but not including) the current month. Commit the cache file
 * to GitHub so Railway serves it on boot without live scraping.
 *
 * Usage:  node scripts/populate-cache.js
 *
 * Add --state MH  to also fetch a specific state.
 * Add --dry       to just print what would be fetched without hitting the network.
 */

import { fetchData } from '../server/src/vahan-scraper.js';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const extraState = args[args.indexOf('--state') + 1] ?? null;

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth(); // 0-indexed, so Jan=0

// Calendar years that are fully complete (no data will change)
const historicalYears = [];
for (let y = 2018; y < currentYear; y++) historicalYears.push(String(y));

// Current calendar year months completed so far (Jan–last full month)
// We'll fetch these as Month Wise queries
const completedMonthsOfCurrentYear = currentMonth; // count of months done (0 = none yet)

const Y_AXIS = ['Vehicle Category', 'Maker', 'Fuel Type'];
const STATES = ['-1', ...(extraState ? [extraState] : [])];

const queries = [];

// Yearly summaries (Calendar Year) for each completed year
for (const state of STATES) {
  for (const yAxis of Y_AXIS) {
    for (const year of historicalYears) {
      queries.push({ state, rto: '-1', yAxis, xAxis: 'Calendar Year', years: [year], vehicleCategories: [], fuelTypes: [] });
    }
  }
}

// Month-wise for historical years
for (const state of STATES) {
  for (const yAxis of Y_AXIS) {
    for (const year of historicalYears) {
      queries.push({ state, rto: '-1', yAxis, xAxis: 'Month Wise', yearType: 'C', year, vehicleCategories: [], fuelTypes: [] });
    }
  }
}

// Month-wise current year — only if some months are complete
if (completedMonthsOfCurrentYear > 0) {
  for (const state of STATES) {
    for (const yAxis of Y_AXIS) {
      queries.push({ state, rto: '-1', yAxis, xAxis: 'Month Wise', yearType: 'C', year: String(currentYear), vehicleCategories: [], fuelTypes: [] });
    }
  }
}

console.log(`\nPopulating cache — ${queries.length} queries (dry=${DRY})\n`);

if (DRY) {
  for (const q of queries) console.log(JSON.stringify(q));
  process.exit(0);
}

let ok = 0;
let fail = 0;

for (const [i, filters] of queries.entries()) {
  const label = `[${i + 1}/${queries.length}] ${filters.yAxis} | ${filters.xAxis} | ${filters.year ?? filters.years?.join(',')} | state=${filters.state}`;
  try {
    process.stdout.write(`${label} ... `);
    const result = await fetchData(filters);
    console.log(`${result.rows?.length ?? 0} rows${result.cached ? ' (cached)' : ''}`);
    ok++;
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
    fail++;
  }
  // Small pause between queries so we don't hammer the site
  await new Promise(r => setTimeout(r, 1500));
}

console.log(`\nDone: ${ok} ok, ${fail} failed`);
console.log(`Cache written to server/.cache/historical.json`);
console.log(`Now run: git add server/.cache/historical.json && git commit -m "chore: update historical cache" && git push`);
