import express from 'express';
import cors from 'cors';
import { createVahanSession, fetchData, fetchRtoList, getCacheStats, clearCache } from './vahan-scraper.js';
import { STATES, VEHICLE_CATEGORIES, Y_AXIS_OPTIONS, X_AXIS_OPTIONS, FUEL_TYPES, NORMS, MAKERS } from './constants.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/filters', (_req, res) => {
  res.json({
    states: STATES,
    vehicleCategories: VEHICLE_CATEGORIES,
    yAxisOptions: Y_AXIS_OPTIONS,
    xAxisOptions: X_AXIS_OPTIONS,
    fuelTypes: FUEL_TYPES,
    norms: NORMS,
    makers: MAKERS,
  });
});

app.post('/api/rto-list', async (req, res) => {
  try {
    const { stateCode, forceRefresh } = req.body;
    const rtoList = await fetchRtoList(stateCode, forceRefresh);
    res.json({ rtoList });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fetch-data', async (req, res) => {
  try {
    const { filters, forceRefresh } = req.body;
    const data = await fetchData(filters, forceRefresh);
    res.json(data);
  } catch (error) {
    console.error('Fetch data error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cache', (_req, res) => {
  res.json(getCacheStats());
});

app.delete('/api/cache', (_req, res) => {
  clearCache();
  res.json({ cleared: true });
});

app.listen(PORT, () => {
  console.log(`Vahan Dashboard API running on port ${PORT}`);
});

export default app;
