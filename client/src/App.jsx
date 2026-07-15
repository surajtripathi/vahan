import React, { useState, useEffect } from 'react';
import MultiSelect from './components/MultiSelect.jsx';
import DataChart from './components/DataChart.jsx';
import DataTable from './components/DataTable.jsx';

const API_BASE = import.meta.env.VITE_API_URL || '';

const CHART_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
  '#0891b2', '#e11d48', '#65a30d', '#7c3aed', '#0d9488',
];

export default function App() {
  const [filters, setFilters] = useState(null);
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
  const [cacheInfo, setCacheInfo] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/filters`)
      .then(r => r.json())
      .then(setFilters)
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (state !== '-1') {
      fetch(`${API_BASE}/api/rto-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stateCode: state }),
      })
        .then(r => r.json())
        .then(data => {
          setRtoList(data.rtoList || []);
          setRto('-1');
        })
        .catch(() => setRtoList([]));
    } else {
      setRtoList([]);
      setRto('-1');
    }
  }, [state]);

  async function handleFetch(forceRefresh = false) {
    setLoading(true);
    setError(null);
    setCacheInfo(null);

    try {
      if (companies.length > 0) {
        const params = {
          state, rto, yAxis: 'Maker', xAxis, yearType, year, years,
          vehicleCategories, fuelTypes,
          companies,
        };
        const resp = await fetch(`${API_BASE}/api/fetch-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters: params, forceRefresh }),
        });
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        setCacheInfo(data.cached ? { type: data.cacheType || '24h' } : null);

        const results = companies.map(company => {
          const keyword = company.toUpperCase().split(' ')[0];
          const matchedRows = data.rows.filter(row => {
            const makerCol = (row[1] || row[0] || '').toUpperCase();
            return makerCol.startsWith(keyword);
          });
          return {
            label: company.split(' ').slice(0, 2).join(' '),
            headers: data.headers,
            rows: matchedRows,
          };
        });

        const validResults = results.filter(r => r.rows.length > 0);
        setDatasets(validResults.length > 0 ? validResults : [{ label: 'All Makers', headers: data.headers, rows: data.rows }]);

        if (validResults.length === 0 && data.rows.length > 0) {
          setError(`Selected companies not found in top ${data.rows.length} results. Showing all available maker data. Try selecting a specific vehicle category (e.g., LMV for cars) or a specific state.`);
        }
      } else {
        const params = {
          state, rto, yAxis, xAxis, yearType, year, years,
          vehicleCategories, fuelTypes,
        };
        const resp = await fetch(`${API_BASE}/api/fetch-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters: params, forceRefresh }),
        });
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        setCacheInfo(data.cached ? { type: data.cacheType || '24h' } : null);

        setDatasets([{ label: 'All', headers: data.headers, rows: data.rows }]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!filters) {
    return (
      <div className="app">
        <div className="loading-overlay">
          <div className="spinner" />
          Loading filters...
        </div>
      </div>
    );
  }

  const yearOptions = [];
  for (let y = 2026; y >= 2003; y--) yearOptions.push(String(y));

  const companyOptions = (filters.makers || MAKERS_FALLBACK).map(m => ({
    value: m, label: m
  }));

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
              {filters.states.map(s => (
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
              {filters.yAxisOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>X-Axis</label>
            <select value={xAxis} onChange={e => setXAxis(e.target.value)}>
              {filters.xAxisOptions.map(o => (
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
              options={filters.vehicleCategories.map(c => ({ value: c.code, label: c.name }))}
              selected={vehicleCategories}
              onChange={setVehicleCategories}
              placeholder="All categories"
            />
          </div>

          <div className="filter-group">
            <label>Fuel Type</label>
            <MultiSelect
              options={filters.fuelTypes.map(f => ({ value: f.id, label: f.name }))}
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
          <button className="btn-primary" onClick={() => handleFetch()} disabled={loading}>
            {loading ? 'Fetching...' : 'Fetch Data'}
          </button>
          <button className="btn-secondary" onClick={() => {
            setDatasets([]);
            setError(null);
          }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2>Results {datasets.length > 1 ? `(${datasets.length} datasets)` : ''}</h2>
              {cacheInfo && (
                <span className={`cache-badge ${cacheInfo.type === 'permanent' ? 'cache-permanent' : ''}`}
                  title={cacheInfo.type === 'permanent' ? 'Historical data — cached permanently' : 'Current period — cached for 24h'}>
                  {cacheInfo.type === 'permanent' ? 'cached (historical)' : 'cached (24h)'}
                  {cacheInfo.type !== 'permanent' && (
                    <button className="cache-refresh-btn" onClick={() => handleFetch(true)} title="Force refresh from Vahan">
                      refresh
                    </button>
                  )}
                </span>
              )}
            </div>
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
            Fetching data from Vahan... This may take 10-30 seconds.
          </div>
        </div>
      )}
    </div>
  );
}

const MAKERS_FALLBACK = [
  'MARUTI SUZUKI INDIA LTD',
  'HYUNDAI MOTOR INDIA LTD',
  'TATA MOTORS LTD',
  'MAHINDRA & MAHINDRA LTD',
  'KIA INDIA PVT LTD',
  'TOYOTA KIRLOSKAR MOTOR PVT LTD',
  'HONDA CARS INDIA LTD',
  'MG MOTOR INDIA PVT LTD',
  'SKODA AUTO VOLKSWAGEN INDIA PVT LTD',
  'RENAULT INDIA PVT LTD',
  'NISSAN MOTOR INDIA PVT LTD',
  'HERO MOTOCORP LTD',
  'HONDA MOTORCYCLE AND SCOOTER INDIA PVT LTD',
  'TVS MOTOR COMPANY LTD',
  'BAJAJ AUTO LTD',
  'ROYAL ENFIELD',
  'SUZUKI MOTORCYCLE INDIA PVT LTD',
  'YAMAHA MOTOR INDIA PVT LTD',
  'OLA ELECTRIC TECHNOLOGIES PVT LTD',
  'ATHER ENERGY PVT LTD',
  'BYD INDIA PVT LTD',
  'MERCEDES BENZ INDIA PVT LTD',
  'BMW INDIA PVT LTD',
  'ASHOK LEYLAND LTD',
  'EICHER MOTORS LTD',
  'FORCE MOTORS LTD',
];
