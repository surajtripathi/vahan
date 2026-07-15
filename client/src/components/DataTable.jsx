import React, { useState } from 'react';

export default function DataTable({ datasets }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [expandedSources, setExpandedSources] = useState({});

  if (!datasets || datasets.length === 0) return null;

  const isMultiDataset = datasets.length > 1;
  const hasGroupedRows = isMultiDataset && datasets.some(ds => ds.rows.length > 1);

  if (!hasGroupedRows) {
    return <SimpleTable datasets={datasets} sortCol={sortCol} sortDir={sortDir} setSortCol={setSortCol} setSortDir={setSortDir} />;
  }

  const headers = ['Source', ...datasets[0].headers];

  function toggleSource(label) {
    setExpandedSources(prev => ({ ...prev, [label]: !prev[label] }));
  }

  function handleSort(colIndex) {
    if (sortCol === colIndex) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(colIndex);
      setSortDir('desc');
    }
  }

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                onClick={() => handleSort(i)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                {h}
                {sortCol === i && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datasets.map(ds => {
            const isExpanded = expandedSources[ds.label];
            const summaryRow = computeSummaryRow(ds);
            const sortedRows = getSortedRows(ds.rows, sortCol ? sortCol - 1 : null, sortDir);

            return (
              <React.Fragment key={ds.label}>
                <tr
                  className="group-header-row"
                  onClick={() => toggleSource(ds.label)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                    {' '}{ds.label}
                    <span className="row-count">({ds.rows.length})</span>
                  </td>
                  {summaryRow.map((cell, j) => (
                    <td key={j} className={j > 0 ? 'numeric' : ''} style={{ fontWeight: 600 }}>
                      {formatCell(cell, j)}
                    </td>
                  ))}
                </tr>
                {isExpanded && sortedRows.map((row, i) => (
                  <tr key={`${ds.label}-${i}`} className="child-row">
                    <td></td>
                    {row.map((cell, j) => (
                      <td key={j} className={j > 0 ? 'numeric' : ''}>
                        {formatCell(cell, j)}
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SimpleTable({ datasets, sortCol, sortDir, setSortCol, setSortDir }) {
  const merged = mergeDatasets(datasets);
  if (!merged.headers.length) return null;

  function handleSort(colIndex) {
    if (sortCol === colIndex) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(colIndex);
      setSortDir('desc');
    }
  }

  const sortedRows = [...merged.rows];
  if (sortCol !== null) {
    sortedRows.sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];
      const aNum = parseFloat((aVal || '0').replace(/,/g, ''));
      const bNum = parseFloat((bVal || '0').replace(/,/g, ''));

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
      }
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            {merged.headers.map((h, i) => (
              <th
                key={i}
                onClick={() => handleSort(i)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                {h}
                {sortCol === i && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={j > 0 ? 'numeric' : ''}>
                  {formatCell(cell, j)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function computeSummaryRow(ds) {
  if (ds.rows.length === 1) return ds.rows[0];

  const numCols = ds.rows[0]?.length || 0;
  const summary = new Array(numCols).fill('');

  summary[0] = '';
  const nameCol = 1;
  summary[nameCol] = `${ds.rows.length} companies`;

  for (let col = nameCol + 1; col < numCols; col++) {
    let total = 0;
    let hasNumeric = false;
    for (const row of ds.rows) {
      const val = parseFloat((row[col] || '0').replace(/,/g, ''));
      if (!isNaN(val)) {
        total += val;
        hasNumeric = true;
      }
    }
    summary[col] = hasNumeric ? total.toLocaleString('en-IN') : '';
  }

  return summary;
}

function getSortedRows(rows, colIdx, dir) {
  if (colIdx === null) return rows;
  return [...rows].sort((a, b) => {
    const aVal = a[colIdx];
    const bVal = b[colIdx];
    const aNum = parseFloat((aVal || '0').replace(/,/g, ''));
    const bNum = parseFloat((bVal || '0').replace(/,/g, ''));
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return dir === 'asc' ? aNum - bNum : bNum - aNum;
    }
    return dir === 'asc'
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });
}

function mergeDatasets(datasets) {
  if (datasets.length === 1) {
    return datasets[0];
  }
  const headers = ['Source', ...datasets[0].headers];
  const rows = [];
  for (const ds of datasets) {
    for (const row of ds.rows) {
      rows.push([ds.label, ...row]);
    }
  }
  return { headers, rows };
}

function formatCell(value, colIndex) {
  if (colIndex === 0) return value;
  const num = parseFloat((value || '0').replace(/,/g, ''));
  if (isNaN(num)) return value;
  return num.toLocaleString('en-IN');
}
