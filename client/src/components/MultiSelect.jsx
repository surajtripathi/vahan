import React, { useState, useRef, useEffect } from 'react';

export default function MultiSelect({ options, selected, onChange, placeholder, searchable = true }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(value) {
    const next = selected.includes(value)
      ? selected.filter(v => v !== value)
      : [...selected, value];
    onChange(next);
  }

  function selectAll() {
    onChange(filtered.map(o => o.value));
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div className="multi-select" ref={ref}>
      <div className="multi-select-trigger" onClick={() => setOpen(!open)}>
        {selected.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>{placeholder || 'Select...'}</span>
        ) : (
          <div className="selected-tags">
            {selected.length <= 3 ? (
              selected.map(v => {
                const opt = options.find(o => o.value === v);
                return <span key={v} className="tag">{opt?.label || v}</span>;
              })
            ) : (
              <span className="tag">{selected.length} selected</span>
            )}
          </div>
        )}
        <span style={{ fontSize: '10px' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="multi-select-dropdown">
          {searchable && (
            <div className="multi-select-search">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button
                  onClick={selectAll}
                  style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Select All
                </button>
                <button
                  onClick={clearAll}
                  style={{ fontSize: '11px', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
          {filtered.map(opt => (
            <label key={opt.value} className="multi-select-option">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
              />
              {opt.label}
            </label>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  );
}
