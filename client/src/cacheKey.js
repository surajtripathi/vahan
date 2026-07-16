export function buildCacheKey(filters) {
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

export function yearFileKey(filters) {
  const xAxis = filters.xAxis || 'Month Wise';
  if (xAxis === 'Month Wise') {
    return filters.year === 'A' ? 'current' : (filters.year || 'unknown');
  }
  const years = (filters.years || []);
  return years.length > 0 ? [...years].sort().join('-') : 'unknown';
}
