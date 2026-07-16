import React, { useState, useEffect } from 'react';
import MultiSelect from './components/MultiSelect.jsx';
import DataChart from './components/DataChart.jsx';
import DataTable from './components/DataTable.jsx';
import { STATES, VEHICLE_CATEGORIES, Y_AXIS_OPTIONS, X_AXIS_OPTIONS, FUEL_TYPES, MAKERS } from './constants.js';
import { buildCacheKey, yearFileKey } from './cacheKey.js';

const CHART_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
  '#0891b2', '#e11d48', '#65a30d', '#7c3aed', '#0d9488',
];

const yearFileCache = new Map();

async function fetchYearFile(yearKey) {
  if (yearFileCache.has(yearKey)) return yearFileCache.get(yearKey);
  const resp = await fetch(`/cache/${yearKey}.json`);
  if (!resp.ok) throw new Error(`No cached data for ${yearKey}`);
  const file = await resp.json();
  yearFileCache.set(yearKey, file);
  return file;
}

let rtoFileCache = null;
async function fetchRtoFile() {
  if (rtoFileCache) return rtoFileCache;
  const resp = await fetch('/cache/rto.json');
  if (!resp.ok) throw new Error('Failed to load RTO data');
  rtoFileCache = await resp.json();
  return rtoFileCache;
}

export default function App() {
  const [state, setState] = useState('-1');
  const [rto, setRto] = useState('-1');
  const [rtoList, setRtoList] = useState([]);
  const [yAxis, setYAxis] = useState('Vehicle Category');
  const [xAxis, setXAxis] = useState('Month Wise');
  const [yearType, setYearType] = useState('C');
  const [year, setYear] = useState('2026');
  const [years, setYears] = useState(['2026']);
  const [vehicleCategories, setVehicleCategories] = useState([]);
  const [fuelTypes, setFuelTypes] = useState([]);
  const [companies, setCompanies] = useState([]);

  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('chart');
  const [chartType, setChartType] = useState('bar');

  useEffect(() => {
    if (state === '-1') {
      setRtoList([]);
      setRto('-1');
      return;
    }
    fetchRtoFile()
      .then(file => {
        const entry = (file.rto || []).find(e => e.key === state);
        setRtoList(entry?.data || []);
        setRto('-1');
      })
      .catch(() => { setRtoList([]); setRto('-1'); });
  }, [state]);

  async function handleFetch() {
    setLoading(true);
    setError(null);

    try {
      const baseFilters = { state, rto, xAxis, yearType, year, years, vehicleCategories, fuelTypes };

      if (companies.length > 0) {
        const filters = { ...baseFilters, yAxis: 'Maker' };
        const yearKey = yearFileKey(filters);
        const file = await fetchYearFile(yearKey);
        const key = buildCacheKey(filters);
        const entry = (file.data || []).find(e => e.key === key);
        if (!entry) throw new Error(`No cached data found for ${yearKey}. Run the populate script and push.`);

        const results = companies.map(company => {
          const keyword = company.toUpperCase().split(' ')[0];
          const matchedRows = entry.data.rows.filter(row => {
            const makerCol = (row[1] || row[0] || '').toUpperCase();
            return makerCol.startsWith(keyword);
          });
          return { label: company.split(' ').slice(0, 2).join(' '), headers: entry.data.headers, rows: matchedRows };
        });

        const validResults = results.filter(r => r.rows.length > 0);
        setDatasets(validResults.length > 0 ? validResults : [{ label: 'All Makers', ...entry.data }]);

        if (validResults.length === 0 && entry.data.rows.length > 0) {
          setError(`Selected companies not found in results. Showing all available maker data.`);
        }
      } else {
        const filters = { ...baseFilters, yAxis };
        const yearKey = yearFileKey(filters);
        const file = await fetchYearFile(yearKey);
        const key = buildCacheKey(filters);
        const entry = (file.data || []).find(e => e.key === key);
        if (!entry) throw new Error(`No cached data found for ${yearKey}. Run the populate script and push.`);
        setDatasets([{ label: 'All', ...entry.data }]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const yearOptions = [];
  for (let y = 2026; y >= 2003; y--) yearOptions.push(String(y));

  const companyOptions = MAKERS.map(m => ({ value: m, label: m }));

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>Vahan Vehicle Registration Dashboard</h1>
          <p className="subtitle">Real-time data from vahan.parivahan.gov.in</p>
        </div>
      </div>

      <div className="filters-panel">
        <div className="filters-grid">
          <div className="filter-group">
            <label>State</label>
            <select value={state} onChange={e => setState(e.target.value)}>
              {STATES.map(s => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>RTO</label>
            <select value={rto} onChange={e => setRto(e.target.value)} disabled={state === '-1'}>
              <option value="-1">All</option>
              {rtoList.map(r => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Y-Axis</label>
            <select value={yAxis} onChange={e => setYAxis(e.target.value)}>
              {Y_AXIS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>X-Axis</label>
            <select value={xAxis} onChange={e => setXAxis(e.target.value)}>
              {X_AXIS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {xAxis === 'Month Wise' && (
            <>
              <div className="filter-group">
                <label>Year Type</label>
                <select value={yearType} onChange={e => setYearType(e.target.value)}>
                  <option value="C">Calendar Year</option>
                  <option value="F">Financial Year</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Year</label>
                <select value={year} onChange={e => setYear(e.target.value)}>
                  <option value="A">Till Today</option>
                  {yearOptions.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {(xAxis === 'Calendar Year' || xAxis === 'Financial Year') && (
            <div className="filter-group">
              <label>Years</label>
              <MultiSelect
                options={yearOptions.map(y => ({
                  value: xAxis === 'Financial Year' ? `${y}-${parseInt(y)+1}` : y,
                  label: xAxis === 'Financial Year' ? `${y}-${parseInt(y)+1}` : y,
                }))}
                selected={years}
                onChange={setYears}
                placeholder="Select years..."
                searchable={false}
              />
            </div>
          )}
        </div>

        <div className="filters-grid" style={{ marginTop: '12px' }}>
          <div className="filter-group">
            <label>Vehicle Categories</label>
            <MultiSelect
              options={VEHICLE_CATEGORIES.map(c => ({ value: c.code, label: c.name }))}
              selected={vehicleCategories}
              onChange={setVehicleCategories}
              placeholder="All categories"
            />
          </div>

          <div className="filter-group">
            <label>Fuel Type</label>
            <MultiSelect
              options={FUEL_TYPES.map(f => ({ value: f.id, label: f.name }))}
              selected={fuelTypes}
              onChange={setFuelTypes}
              placeholder="All fuels"
            />
          </div>

          <div className="filter-group" style={{ gridColumn: 'span 2' }}>
            <label>Companies (Compare)</label>
            <MultiSelect
              options={companyOptions}
              selected={companies}
              onChange={setCompanies}
              placeholder="Select companies to compare..."
              searchable={true}
            />
          </div>
        </div>

        <div className="actions-row" style={{ marginTop: '16px' }}>
          <button className="btn-primary" onClick={handleFetch} disabled={loading}>
            {loading ? 'Loading...' : 'Fetch Data'}
          </button>
          <button className="btn-secondary" onClick={() => { setDatasets([]); setError(null); }}>
            Clear
          </button>
          {companies.length > 0 && (
            <div className="dataset-chips">
              {companies.map((c, i) => (
                <span key={c} className="dataset-chip">
                  <span className="color-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  {c.split(' ').slice(0, 2).join(' ')}
                  <button onClick={() => setCompanies(companies.filter(x => x !== c))}>x</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {datasets.length > 0 && (
        <div className="results-panel">
          <div className="results-header">
            <h2>Results {datasets.length > 1 ? `(${datasets.length} datasets)` : ''}</h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div className="tab-group">
                <button className={`tab ${chartType === 'bar' ? 'active' : ''}`} onClick={() => setChartType('bar')}>Bar</button>
                <button className={`tab ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>Line</button>
              </div>
              <div className="tab-group">
                <button className={`tab ${activeTab === 'chart' ? 'active' : ''}`} onClick={() => setActiveTab('chart')}>Chart</button>
                <button className={`tab ${activeTab === 'table' ? 'active' : ''}`} onClick={() => setActiveTab('table')}>Table</button>
              </div>
            </div>
          </div>

          {activeTab === 'chart' && (
            <div className="chart-container">
              <DataChart datasets={datasets} chartType={chartType} />
            </div>
          )}

          {activeTab === 'table' && (
            <DataTable datasets={datasets} />
          )}
        </div>
      )}

      {!loading && datasets.length === 0 && !error && (
        <div className="results-panel">
          <div className="empty-state">
            <p>Select filters and click "Fetch Data" to load vehicle registration data.</p>
            <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
              Tip: Select multiple companies to compare their registrations side by side.
            </p>
          </div>
        </div>
      )}

      {loading && (
        <div className="results-panel">
          <div className="loading-overlay">
            <div className="spinner" />
            Loading data...
          </div>
        </div>
      )}
    </div>
  );
}
