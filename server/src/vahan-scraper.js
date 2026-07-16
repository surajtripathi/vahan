import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = process.env.CACHE_DIR || join(__dirname, '..', '.cache');

const BASE_URL = 'https://vahan.parivahan.gov.in/vahan4dashboard/vahan/view/reportview.xhtml';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const dataCache = new Map();
const rtoCache = new Map();

function yearKeyFromCacheKey(cacheKey) {
  try {
    const k = JSON.parse(cacheKey);
    if (k.xAxis === 'Month Wise') return k.year === 'A' ? 'current' : (k.year || 'unknown');
    // k.years is stored as a comma-joined string e.g. "2024" or "2024,2025"
    if (k.years && k.years.length > 0) return k.years.split(',').filter(Boolean).sort().join('-');
    return 'unknown';
  } catch { return 'unknown'; }
}

function loadHistoricalCache() {
  let dataCount = 0, rtoCount = 0;
  try {
    const files = readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const stored = JSON.parse(readFileSync(join(CACHE_DIR, file), 'utf-8'));
        for (const entry of (stored.data || [])) {
          dataCache.set(entry.key, { data: entry.data, timestamp: entry.timestamp });
          dataCount++;
        }
        for (const entry of (stored.rto || [])) {
          rtoCache.set(entry.key, { data: entry.data, timestamp: entry.timestamp });
          rtoCount++;
        }
      } catch (e) {
        console.error(`[vahan] Failed to read cache file ${file}:`, e.message);
      }
    }
  } catch {
    // cache dir doesn't exist yet
  }
  console.log(`[vahan] Loaded cache: ${dataCount} data entries, ${rtoCount} RTO entries`);
}

export function saveYearFile(yearKey) {
  const data = [];
  for (const [key, entry] of dataCache) {
    if (yearKeyFromCacheKey(key) === yearKey) {
      data.push({ key, data: entry.data, timestamp: entry.timestamp });
    }
  }
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(join(CACHE_DIR, `${yearKey}.json`), JSON.stringify({ data }));
  } catch (e) {
    console.error(`[vahan] Failed to write cache ${yearKey}.json:`, e.message);
  }
}

export function saveRtoFile() {
  const rto = [];
  for (const [key, entry] of rtoCache) {
    rto.push({ key, data: entry.data, timestamp: entry.timestamp });
  }
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(join(CACHE_DIR, 'rto.json'), JSON.stringify({ rto }));
  } catch (e) {
    console.error('[vahan] Failed to write cache rto.json:', e.message);
  }
}

loadHistoricalCache();


function buildCacheKey(filters) {
  const xAxis = filters.xAxis || 'Month Wise';
  const isMonthWise = xAxis === 'Month Wise';
  const keyParts = {
    state: filters.state || '-1',
    rto: filters.rto || '-1',
    yAxis: filters.yAxis || 'Vehicle Category',
    xAxis,
    yearType: isMonthWise ? (filters.yearType || 'C') : '',
    year: isMonthWise ? (filters.year || '2026') : '',
    years: isMonthWise ? '' : (filters.years || []).sort().join(','),
    vehicleCategories: (filters.vehicleCategories || []).sort().join(','),
    fuelTypes: (filters.fuelTypes || []).sort().join(','),
    norms: (filters.norms || []).sort().join(','),
  };
  return JSON.stringify(keyParts);
}

function getCached(cache, key) {
  const entry = cache.get(key);
  return entry ? entry.data : null;
}

function setCache(cache, key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

const AJAX_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'Faces-Request': 'partial/ajax',
  'X-Requested-With': 'XMLHttpRequest',
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry(fn, retries = 5, delayMs = 2000) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isRetryable = err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED'
        || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND'
        || (err.response && err.response.status >= 500);
      if (!isRetryable || i === retries - 1) throw err;
      console.log(`[vahan] Retry ${i + 1}/${retries - 1} after ${err.code}...`);
      await sleep(delayMs * (i + 1));
    }
  }
  throw lastErr;
}

function createClient() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': BASE_URL,
    },
    maxRedirects: 5,
    timeout: 45000,
  }));
  return { client, jar };
}

function discoverIds(html) {
  const $ = cheerio.load(html);
  const ids = {};

  // Refresh button: the button whose onclick renders combTablePnl + groupingTable
  $('button[type="submit"]').each((_i, el) => {
    const onclick = $(el).attr('onclick') || '';
    if (onclick.includes('combTablePnl') && onclick.includes('groupingTable')) {
      ids.refreshButton = $(el).attr('id');
    }
  });

  // PrimeFaces SelectOneMenu renders: <select id="j_idt47_input">
  // The POST param name IS the select element's id (already ends in _input)
  // The base component id is the select id minus the _input suffix

  // State dropdown: the <select> containing state codes as option values
  $('select').each((_i, el) => {
    const options = $(el).find('option');
    const vals = options.map((_j, opt) => $(opt).attr('value')).get();
    if (vals.includes('MH') && vals.includes('DL') && vals.includes('KA')) {
      const selectId = $(el).attr('id');
      ids.stateInput = selectId;
      ids.stateSelectBase = selectId?.replace(/_input$/, '') || null;
    }
  });

  // Display unit dropdown: the <select> with options A, T, L, C
  $('select').each((_i, el) => {
    const options = $(el).find('option');
    const vals = options.map((_j, opt) => $(opt).attr('value')).get();
    if (vals.includes('A') && vals.includes('T') && vals.includes('L') && vals.includes('C') && vals.length <= 5) {
      ids.displayUnitInput = $(el).attr('id');
    }
  });

  // Fallback: extract IDs from onclick handlers if button was found
  if (ids.refreshButton && !ids.stateInput) {
    // State dropdown often referenced in a change handler that renders selectedRto
    $('script').each((_i, el) => {
      const text = $(el).html() || '';
      const match = text.match(/PrimeFaces\.cw\("SelectOneMenu","[^"]*",\{id:"([^"]+)"[^}]*\}[^)]*\)/g);
      if (match) {
        for (const m of match) {
          const idMatch = m.match(/id:"([^"]+)"/);
          if (idMatch) {
            const widgetId = idMatch[1];
            const behaviorMatch = m.match(/selectedRto/);
            if (behaviorMatch) {
              ids.stateSelectBase = widgetId;
              ids.stateInput = widgetId + '_input';
            }
          }
        }
      }
    });
  }

  // Extract state change source from behavior scripts
  $('script').each((_i, el) => {
    const text = $(el).html() || '';
    if (text.includes('selectedRto') && text.includes('yaxisVar')) {
      const sourceMatch = text.match(/"([^"]+)"[^}]*behaviors:\{change:"PrimeFaces\.ab\(\{s:"([^"]+)"/);
      if (sourceMatch) {
        ids.stateChangeSource = sourceMatch[2];
      }
      // Also try: PrimeFaces.ab({s:"j_idt47",...,u:"selectedRto yaxisVar"
      const abMatch = text.match(/PrimeFaces\.ab\(\{s:"([^"]+)"[^}]*u:"selectedRto\s+yaxisVar"/);
      if (abMatch) {
        ids.stateChangeSource = abMatch[1];
      }
    }
  });

  // Another approach: look for the selectonemenu whose change event updates selectedRto
  if (!ids.stateChangeSource) {
    const fullHtml = html;
    const stateChangeMatch = fullHtml.match(/s:"([^"]+)"[^}]*p:"[^"]*"[^}]*u:"selectedRto\s+yaxisVar"/);
    if (stateChangeMatch) {
      ids.stateChangeSource = stateChangeMatch[1];
    }
    // Even simpler: look for the behavior directly
    const behaviorMatch = fullHtml.match(/s:&quot;([^&]+)&quot;[^"]*u:&quot;selectedRto\s+yaxisVar&quot;/);
    if (behaviorMatch) {
      ids.stateChangeSource = behaviorMatch[1];
    }
  }

  // If we found stateChangeSource but not stateInput, derive it
  if (ids.stateChangeSource && !ids.stateInput) {
    ids.stateInput = ids.stateChangeSource + '_input';
    ids.stateSelectBase = ids.stateChangeSource;
  }

  // displayUnitInput: the first selectonemenu before the state one
  if (!ids.displayUnitInput && ids.stateSelectBase) {
    $('div.ui-selectonemenu').each((_i, el) => {
      const selectEl = $(el).find('select');
      const selectId = selectEl.attr('id');
      if (selectId && selectId < ids.stateSelectBase) {
        const options = selectEl.find('option');
        const vals = options.map((_j, opt) => $(opt).attr('value')).get();
        if (vals.length >= 3 && vals.length <= 5) {
          ids.displayUnitInput = selectId;
        }
      }
    });
  }

  console.log('[vahan] Discovered IDs:', JSON.stringify(ids, null, 2));
  return ids;
}

async function initSession(client) {
  const response = await client.get(BASE_URL);
  const $ = cheerio.load(response.data);
  const viewState = $('input[name="javax.faces.ViewState"]').val();
  if (!viewState) {
    throw new Error('Failed to get ViewState from initial page load');
  }
  const ids = discoverIds(response.data);
  return { viewState, ids };
}

function buildRefreshParams(viewState, ids, filters) {
  const params = new URLSearchParams();
  const btnId = ids.refreshButton || 'j_idt79';

  params.append('javax.faces.partial.ajax', 'true');
  params.append('javax.faces.source', btnId);
  params.append('javax.faces.partial.execute', '@all');
  params.append('javax.faces.partial.render', 'VhCatg norms fuel VhClass combTablePnl groupingTable msg vhCatgPnl');
  params.append(btnId, btnId);
  params.append('masterLayout_formlogin', 'masterLayout_formlogin');

  params.append(ids.displayUnitInput || 'j_idt38_input', 'A');
  params.append(ids.stateInput || 'j_idt47_input', filters.state || '-1');
  params.append('selectedRto_input', filters.rto || '-1');
  params.append('yaxisVar_input', filters.yAxis || 'Vehicle Category');
  params.append('xaxisVar_input', filters.xAxis || 'Month Wise');

  if (filters.xAxis === 'Month Wise') {
    params.append('selectedYearType_input', filters.yearType || 'C');
    params.append('selectedYear_input', filters.year || '2026');
  }

  if (filters.xAxis === 'Calendar Year' || filters.xAxis === 'Financial Year') {
    const years = filters.years || ['2026'];
    for (const year of years) {
      params.append('yearList', year);
    }
  }

  if (filters.vehicleCategories && filters.vehicleCategories.length > 0) {
    for (const cat of filters.vehicleCategories) {
      params.append('VhCatg', cat);
    }
  }

  if (filters.fuelTypes && filters.fuelTypes.length > 0) {
    for (const fuel of filters.fuelTypes) {
      params.append('fuel', fuel);
    }
  }

  if (filters.norms && filters.norms.length > 0) {
    for (const norm of filters.norms) {
      params.append('norms', norm);
    }
  }

  params.append('javax.faces.ViewState', viewState);
  return params;
}

function buildXAxisChangeParams(viewState, xAxis) {
  const params = new URLSearchParams();
  params.append('javax.faces.partial.ajax', 'true');
  params.append('javax.faces.source', 'xaxisVar');
  params.append('javax.faces.partial.execute', 'xaxisVar');
  params.append('javax.faces.partial.render', 'multipleYear');
  params.append('javax.faces.behavior.event', 'change');
  params.append('javax.faces.partial.event', 'change');
  params.append('masterLayout_formlogin', 'masterLayout_formlogin');
  params.append('xaxisVar_input', xAxis);
  params.append('javax.faces.ViewState', viewState);
  return params;
}

function buildStateChangeParams(viewState, ids, stateCode) {
  const params = new URLSearchParams();
  const sourceId = ids.stateChangeSource || ids.stateSelectBase || 'j_idt47';

  params.append('javax.faces.partial.ajax', 'true');
  params.append('javax.faces.source', sourceId);
  params.append('javax.faces.partial.execute', sourceId);
  params.append('javax.faces.partial.render', 'selectedRto yaxisVar');
  params.append('javax.faces.behavior.event', 'change');
  params.append('javax.faces.partial.event', 'change');
  params.append('masterLayout_formlogin', 'masterLayout_formlogin');
  params.append(ids.stateInput || 'j_idt47_input', stateCode);
  params.append('javax.faces.ViewState', viewState);
  return params;
}

function buildExcelDownloadParams(viewState, ids, filters) {
  const params = new URLSearchParams();
  params.append('masterLayout_formlogin', 'masterLayout_formlogin');
  params.append('groupingTable:xls', 'groupingTable:xls');

  params.append(ids.displayUnitInput || 'j_idt38_input', 'A');
  params.append(ids.stateInput || 'j_idt47_input', filters.state || '-1');
  params.append('selectedRto_input', filters.rto || '-1');
  params.append('yaxisVar_input', filters.yAxis || 'Maker');
  params.append('xaxisVar_input', filters.xAxis || 'Month Wise');

  if (filters.xAxis === 'Month Wise') {
    params.append('selectedYearType_input', filters.yearType || 'C');
    params.append('selectedYear_input', filters.year || '2026');
  }

  if (filters.xAxis === 'Calendar Year' || filters.xAxis === 'Financial Year') {
    const years = filters.years || ['2026'];
    for (const year of years) {
      params.append('yearList', year);
    }
  }

  if (filters.vehicleCategories && filters.vehicleCategories.length > 0) {
    for (const cat of filters.vehicleCategories) {
      params.append('VhCatg', cat);
    }
  }

  params.append('javax.faces.ViewState', viewState);
  return params;
}

function extractViewState(xmlData) {
  const match = xmlData.match(/javax\.faces\.ViewState:0[^>]*><!\[CDATA\[(.*?)\]\]>/s);
  return match ? match[1] : null;
}

function parseTableData(xmlData) {
  const cdataMatch = xmlData.match(/id="combTablePnl"[^>]*><!\[CDATA\[(.*?)\]\]>/s)
    || xmlData.match(/id="groupingTable"[^>]*><!\[CDATA\[(.*?)\]\]>/s);

  if (!cdataMatch) {
    const errorMatch = xmlData.match(/error-summary[^>]*>(.*?)<\//);
    if (errorMatch) {
      throw new Error(`Vahan returned error: ${errorMatch[1]}`);
    }
    return { headers: [], rows: [] };
  }

  const $ = cheerio.load(cdataMatch[1]);
  const headers = [];
  const rows = [];

  $('thead th, thead td').each((_i, el) => {
    const text = $(el).text().trim();
    if (text) headers.push(text);
  });

  if (headers.length === 0) {
    $('th, .ui-column-title').each((_i, el) => {
      const text = $(el).text().trim();
      if (text) headers.push(text);
    });
  }

  $('tbody tr').each((_i, tr) => {
    const row = [];
    $(tr).find('td').each((_j, td) => {
      const label = $(td).find('label');
      const text = label.length ? label.text().trim() : $(td).text().trim();
      row.push(text);
    });
    if (row.length > 0 && row.some(cell => cell !== '')) {
      rows.push(row);
    }
  });

  return { headers, rows };
}

function parseGroupingTable(xmlData) {
  const match = xmlData.match(/id="groupingTable"[^>]*><!\[CDATA\[(.*?)\]\]>/s);
  if (!match) return { headers: [], rows: [] };

  const $ = cheerio.load(match[1]);
  const headers = [];
  const rows = [];

  $('thead th').each((_i, el) => {
    const text = $(el).text().trim();
    if (text) headers.push(text);
  });

  $('tbody tr').each((_i, tr) => {
    const row = [];
    $(tr).find('td').each((_j, td) => {
      const label = $(td).find('label');
      const text = label.length ? label.text().trim() : $(td).text().trim();
      row.push(text);
    });
    if (row.length > 0 && row.some(cell => cell !== '')) {
      rows.push(row);
    }
  });

  return { headers, rows };
}

function parseRtoOptions(xmlData) {
  const rtoMatch = xmlData.match(/id="selectedRto"[^>]*><!\[CDATA\[(.*?)\]\]>/s);
  if (!rtoMatch) return [];

  const $ = cheerio.load(rtoMatch[1]);
  const options = [];
  $('option').each((_i, el) => {
    const value = $(el).attr('value');
    const name = $(el).text().trim();
    if (value && name) {
      options.push({ code: value, name });
    }
  });
  return options;
}

async function fetchExcelData(client, viewState, ids, filters) {
  const params = buildExcelDownloadParams(viewState, ids, filters);
  const response = await client.post(BASE_URL, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    responseType: 'arraybuffer',
    timeout: 60000,
  });

  const workbook = XLSX.read(response.data, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (jsonData.length < 3) return { headers: [], rows: [] };

  let headerRowIdx = -1;
  let monthRowIdx = -1;
  for (let i = 0; i < Math.min(5, jsonData.length); i++) {
    const row = jsonData[i].map(c => String(c ?? '').trim());
    if (row.some(c => c === 'S No')) {
      headerRowIdx = i;
    }
    if (row.some(c => /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/i.test(c))) {
      monthRowIdx = i;
    }
  }

  if (headerRowIdx === -1) return { headers: [], rows: [] };

  const headerRow = jsonData[headerRowIdx].map(c => String(c ?? '').replace(/\xa0/g, ' ').trim());
  const months = monthRowIdx >= 0
    ? jsonData[monthRowIdx].map(c => String(c ?? '').trim())
    : [];

  const dataStartCheck = Math.max(headerRowIdx, monthRowIdx) + 1;
  const sampleRow = jsonData[dataStartCheck];
  const colCount = sampleRow ? sampleRow.length : headerRow.length;

  const headers = [];
  for (let i = 0; i < colCount; i++) {
    const monthVal = months[i] || '';
    const headerVal = headerRow[i] || '';

    if (/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|TOTAL)$/i.test(monthVal)) {
      headers.push(monthVal.toUpperCase());
    } else if (headerVal && headerVal !== 'Month Wise') {
      headers.push(headerVal);
    } else if (i === colCount - 1) {
      headers.push('TOTAL');
    } else {
      const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const monthIdx = i - 2;
      if (monthIdx >= 0 && monthIdx < 12) {
        headers.push(MONTH_NAMES[monthIdx]);
      } else {
        headers.push(`Col${i}`);
      }
    }
  }

  const dataStartIdx = Math.max(headerRowIdx, monthRowIdx) + 1;
  const rows = jsonData.slice(dataStartIdx)
    .filter(row => {
      const first = String(row[0] ?? '').trim();
      return first && /^\d+$/.test(first);
    })
    .map(row => row.map(cell => String(cell ?? '').trim()));

  return { headers, rows };
}

export async function createVahanSession() {
  const { client } = createClient();
  const { viewState, ids } = await initSession(client);
  return { client, viewState, ids };
}

export async function fetchRtoList(stateCode, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = getCached(rtoCache, stateCode);
    if (cached) {
      console.log(`[vahan] RTO cache hit for state=${stateCode}`);
      return cached;
    }
  }

  return withRetry(async () => {
    const { client } = createClient();
    const { viewState, ids } = await initSession(client);
    await sleep(600);
    const params = buildStateChangeParams(viewState, ids, stateCode);
    const response = await client.post(BASE_URL, params.toString(), { headers: AJAX_HEADERS });
    const rtoList = parseRtoOptions(response.data);
    setCache(rtoCache, stateCode, rtoList);
    return rtoList;
  });
}

export async function fetchData(filters, forceRefresh = false) {
  const cacheKey = buildCacheKey(filters);

  if (!forceRefresh) {
    const cached = getCached(dataCache, cacheKey);
    if (cached) {
      console.log(`[vahan] Cache hit for key=${cacheKey.slice(0, 80)}...`);
      return { ...cached, cached: true };
    }
  }

  console.log(`[vahan] Fetching fresh data...`);

  return withRetry(async () => {
    const { client } = createClient();
    let { viewState, ids } = await initSession(client);

    if (filters.state && filters.state !== '-1') {
      await sleep(600);
      const stateParams = buildStateChangeParams(viewState, ids, filters.state);
      const stateResp = await client.post(BASE_URL, stateParams.toString(), { headers: AJAX_HEADERS });
      const newVS = extractViewState(stateResp.data);
      if (newVS) viewState = newVS;
    }

    if (filters.xAxis === 'Calendar Year' || filters.xAxis === 'Financial Year') {
      await sleep(600);
      const xParams = buildXAxisChangeParams(viewState, filters.xAxis);
      const xResp = await client.post(BASE_URL, xParams.toString(), { headers: AJAX_HEADERS });
      const newVS = extractViewState(xResp.data);
      if (newVS) viewState = newVS;
    }

    await sleep(800);
    const refreshParams = buildRefreshParams(viewState, ids, filters);
    const response = await client.post(BASE_URL, refreshParams.toString(), { headers: AJAX_HEADERS });

    const { headers, rows } = parseTableData(response.data);
    const groupingData = parseGroupingTable(response.data);
    const finalHeaders = groupingData.headers.length > 0 ? groupingData.headers : headers;
    const finalRows = groupingData.rows.length > 0 ? groupingData.rows : rows;

    if (filters.yAxis === 'Maker') {
      try {
        await sleep(600);
        const currentVS = extractViewState(response.data) || viewState;
        const excelData = await fetchExcelData(client, currentVS, ids, filters);
        if (excelData.rows.length > 0) {
          setCache(dataCache, cacheKey, excelData);
          return { ...excelData, cached: false };
        }
      } catch (e) {
        console.error('Excel download failed, using table data:', e.message);
      }
    }

    const result = { headers: finalHeaders, rows: finalRows };
    setCache(dataCache, cacheKey, result);
    return { ...result, cached: false };
  });
}

export function getCacheStats() {
  const now = Date.now();
  const dataEntries = [];
  for (const [key, entry] of dataCache) {
    dataEntries.push({
      key: JSON.parse(key),
      rows: entry.data.rows.length,
      ageMinutes: Math.round((now - entry.timestamp) / 60000),
    });
  }
  const rtoEntries = [];
  for (const [key, entry] of rtoCache) {
    rtoEntries.push({
      stateCode: key,
      rtoCount: entry.data.length,
      ageMinutes: Math.round((now - entry.timestamp) / 60000),
    });
  }
  return { data: dataEntries, rto: rtoEntries };
}

export function clearCache() {
  dataCache.clear();
  rtoCache.clear();
}
