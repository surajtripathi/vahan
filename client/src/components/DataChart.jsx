import React from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
  '#0891b2', '#e11d48', '#65a30d', '#7c3aed', '#0d9488',
  '#ea580c', '#4f46e5', '#059669', '#d97706', '#db2777',
];

function isNumericColumn(header) {
  return /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|TOTAL|Q[1-4]|\d{4}|\d{4}-\d{4})$/i.test(header);
}

function getNameColumn(headers) {
  const skipCols = ['s no', 'sno', 'sr no', 'month wise', 'total'];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (!skipCols.includes(h) && !isNumericColumn(headers[i])) {
      return i;
    }
  }
  return 1;
}

function getDataColumns(headers) {
  const cols = [];
  for (let i = 0; i < headers.length; i++) {
    if (isNumericColumn(headers[i]) && headers[i].toUpperCase() !== 'TOTAL') {
      cols.push({ index: i, name: headers[i] });
    }
  }
  return cols;
}

export default function DataChart({ datasets, chartType = 'bar' }) {
  if (!datasets || datasets.length === 0) return null;

  const firstDataset = datasets[0];
  if (!firstDataset.headers || firstDataset.headers.length < 3) return null;

  const nameColIdx = getNameColumn(firstDataset.headers);
  const dataCols = getDataColumns(firstDataset.headers);

  if (dataCols.length === 0) return null;

  const chartData = dataCols.map(col => {
    const point = { name: col.name };
    for (const ds of datasets) {
      if (datasets.length > 1) {
        let total = 0;
        for (const row of ds.rows) {
          const rawVal = row[col.index] || '0';
          const val = parseFloat(rawVal.replace(/,/g, ''));
          total += isNaN(val) ? 0 : val;
        }
        point[ds.label] = total;
      } else {
        for (const row of ds.rows) {
          const category = row[nameColIdx] || `Row ${row[0]}`;
          const rawVal = row[col.index] || '0';
          const val = parseFloat(rawVal.replace(/,/g, ''));
          point[category] = isNaN(val) ? 0 : val;
        }
      }
    }
    return point;
  });

  const allKeys = [];
  if (datasets.length > 1) {
    for (const ds of datasets) {
      if (!allKeys.includes(ds.label)) allKeys.push(ds.label);
    }
  } else {
    for (const row of datasets[0].rows) {
      const category = row[nameColIdx] || `Row ${row[0]}`;
      if (!allKeys.includes(category)) allKeys.push(category);
    }
  }

  const visibleKeys = allKeys.slice(0, 15);

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={450}>
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={formatYAxis} />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
            formatter={(value) => value.toLocaleString('en-IN')}
          />
          <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
          {visibleKeys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={450}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11 }}
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={formatYAxis} />
        <Tooltip
          contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
          formatter={(value) => value.toLocaleString('en-IN')}
        />
        <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
        {visibleKeys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            fill={COLORS[i % COLORS.length]}
            radius={[2, 2, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function formatYAxis(value) {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value;
}
