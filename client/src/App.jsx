import React, { useState, useEffect, useCallback } from 'react';
import MultiSelect from './components/MultiSelect.jsx';
import DataChart from './components/DataChart.jsx';
import DataTable from './components/DataTable.jsx';
import { Y_AXIS_OPTIONS, X_AXIS_OPTIONS, MAKERS } from './constants.js';
import { buildCacheKey, yearFileKey } from './cacheKey.js';

const CHART_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
  '#0891b2', '#e11d48', '#65a30d', '#7c3aed', '#0d9488',
];

const yearFileCache = new Map();

async function fetchYearFile(yearKey) {
  if (yearFileCache.has(yearKey)) return yearFileCache.get(yearKey);
  const resp = await fetch(`/cache/${yearKey}.json`);
  if (!resp.ok || !(resp.headers.get('content-type') || '').includes('json'))
    throw new Error(`No cached data for ${yearKey}`);
  const file = await resp.json();
  yearFileCache.set(yearKey, file);
  return file;
}

export default function App() {
  const [yAxis, setYAxis] = useState('Vehicle Category');
  const [xAxis, setXAxis] = useState('Month Wise');
  const [year, setYear] = useState('2026');
  const [years, setYears] = useState(['2026']);
  const [companies, setCompanies] = useState([]);

  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('table');
  const [chartType, setChartType] = useState('bar');

  const handleFetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const baseFilters = { state: '-1', rto: '-1', xAxis, yearType: 'C', year, years, vehicleCategories: [], fuelTypes: [] };

      if (companies.length > 0) {
        const selectedYears = (xAxis === 'Calendar Year') ? years : [year];

        const allResults = [];
        for (const singleYear of selectedYears) {
          const f = {
            ...baseFilters,
            yAxis: 'Maker',
            ...(xAxis === 'Calendar Year' ? { years: [singleYear] } : { year: singleYear }),
          };
          const file = await fetchYearFile(yearFileKey(f));
          const entry = (file.data || []).find(e => e.key === buildCacheKey(f));
          if (!entry) throw new Error(`No cached Maker data for ${singleYear}. Run the populate script.`);

          for (const company of companies) {
            const keyword = company.toUpperCase().split(' ')[0];
            const matchedRows = entry.data.rows.filter(row =>
              (row[1] || row[0] || '').toUpperCase().startsWith(keyword)
            );
            if (matchedRows.length > 0) {
              const label = selectedYears.length > 1
                ? `${company.split(' ').slice(0, 2).join(' ')} ${singleYear}`
                : company.split(' ').slice(0, 2).join(' ');
              allResults.push({ label, headers: entry.data.headers, rows: matchedRows });
            }
          }
        }

        if (allResults.length > 0) {
          setDatasets(allResults);
        } else {
          const fallbackYear = selectedYears[0];
          const f = {
            ...baseFilters,
            yAxis: 'Maker',
            ...(xAxis === 'Calendar Year' ? { years: [fallbackYear] } : { year: fallbackYear }),
          };
          const file = await fetchYearFile(yearFileKey(f));
          const entry = (file.data || []).find(e => e.key === buildCacheKey(f));
          setDatasets(entry ? [{ label: 'All Makers', ...entry.data }] : []);
          setError('Selected companies not found in results. Showing all available maker data.');
        }
      } else {
        const filters = { ...baseFilters, yAxis };

        if (xAxis === 'Calendar Year' && years.length > 1) {
          const results = await Promise.all(
            years.map(async (singleYear) => {
              const f = { ...filters, years: [singleYear] };
              const file = await fetchYearFile(yearFileKey(f));
              const entry = (file.data || []).find(e => e.key === buildCacheKey(f));
              if (!entry) throw new Error(`No cached data for year ${singleYear}`);
              return { label: singleYear, ...entry.data };
            })
          );
          setDatasets(results);
        } else {
          const file = await fetchYearFile(yearFileKey(filters));
          const entry = (file.data || []).find(e => e.key === buildCacheKey(filters));
          if (!entry) throw new Error(`No cached data found for ${yearFileKey(filters)}. Run the populate script and push.`);
          setDatasets([{ label: 'All', ...entry.data }]);
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [yAxis, xAxis, year, years, companies]);

  useEffect(() => {
    handleFetch();
  }, [handleFetch]);

  const yearOptions = [];
  for (let y = 2026; y >= 2003; y--) yearOptions.push(String(y));

  const companyOptions = MAKERS.map(m => ({ value: m, label: m }));

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>Vahan Vehicle Registration Dashboard</h1>
          <p className="subtitle">India vehicle registration data (2003–2026) — explore by year, category, and maker</p>
        </div>
      </div>

      <div className="filters-panel">
        <div className="filters-grid">
          <div className="filter-group">
            <label>Y-Axis</label>
            <select value={yAxis} onChange={e => setYAxis(e.target.value)}>
              {Y_AXIS_OPTIONS.filter(o => o.value === 'Vehicle Category' || o.value === 'Maker').map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>X-Axis</label>
            <select value={xAxis} onChange={e => setXAxis(e.target.value)}>
              {X_AXIS_OPTIONS.filter(o => o.value !== 'Financial Year').map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {xAxis === 'Month Wise' && (
            <div className="filter-group">
              <label>Year</label>
              <select value={year} onChange={e => setYear(e.target.value)}>
                <option value="A">Till Today</option>
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}

          {xAxis === 'Calendar Year' && (
            <div className="filter-group">
              <label>Years</label>
              <MultiSelect
                options={yearOptions.map(y => ({ value: y, label: y }))}
                selected={years}
                onChange={setYears}
                placeholder="Select years..."
                searchable={false}
              />
            </div>
          )}
        </div>

        <div className="filters-grid" style={{ marginTop: '12px' }}>
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

        {companies.length > 0 && (
          <div className="dataset-chips" style={{ marginTop: '12px' }}>
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
            <p>Select filters above to explore vehicle registration data.</p>
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
