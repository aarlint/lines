const express = require('express');
const path = require('path');

const app = express();
const PORT = 3003;
const ARCGIS_BASE = 'https://services.arcgis.com/qnjIrwR8z5Izc0ij/ArcGIS/rest/services/Montana_Cadastral_Framework/FeatureServer';

// Simple in-memory cache (1 hour TTL)
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.time < CACHE_TTL) return entry.data;
  if (entry) cache.delete(key);
  return null;
}

function setCache(key, data) {
  // Evict old entries if cache gets large
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { data, time: Date.now() });
}

async function queryArcGIS(layer, params) {
  const url = new URL(`${ARCGIS_BASE}/${layer}/query`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('f', 'geojson');
  url.searchParams.set('outSR', '4326');
  
  const cacheKey = url.toString();
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`ArcGIS error: ${res.status}`);
  const data = await res.json();
  setCache(cacheKey, data);
  return data;
}

app.use(express.static(path.join(__dirname, 'public')));

// Parcels by bbox
app.get('/api/parcels', async (req, res) => {
  try {
    const { bbox, county } = req.query;
    if (!bbox) return res.status(400).json({ error: 'bbox required' });
    
    const params = {
      geometry: bbox,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      resultRecordCount: '500',
      where: county ? `CountyName='${county.toUpperCase()}'` : '1=1'
    };
    
    const data = await queryArcGIS(1, params);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Single parcel by ID
app.get('/api/parcel/:id', async (req, res) => {
  try {
    const data = await queryArcGIS(1, {
      where: `PARCELID='${req.params.id}'`,
      outFields: '*'
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Search parcels
app.get('/api/search', async (req, res) => {
  try {
    const { q, county } = req.query;
    if (!q) return res.status(400).json({ error: 'q required' });
    
    const term = q.replace(/'/g, "''");
    const countyFilter = county ? ` AND CountyName='${county.toUpperCase()}'` : '';
    const where = `(AddressLine1 LIKE '%${term.toUpperCase()}%' OR OwnerName LIKE '%${term.toUpperCase()}%' OR PARCELID LIKE '%${term}%')${countyFilter}`;
    
    const data = await queryArcGIS(1, {
      where,
      outFields: 'PARCELID,AddressLine1,CityStateZip,OwnerName,TotalValue,TotalAcres,CountyName',
      resultRecordCount: '20'
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Counties list
app.get('/api/counties', (req, res) => {
  const counties = [
    'BEAVERHEAD','BIG HORN','BLAINE','BROADWATER','CARBON','CARTER','CASCADE',
    'CHOUTEAU','CUSTER','DANIELS','DAWSON','DEER LODGE','FALLON','FERGUS',
    'FLATHEAD','GALLATIN','GARFIELD','GLACIER','GOLDEN VALLEY','GRANITE',
    'HILL','JEFFERSON','JUDITH BASIN','LAKE','LEWIS AND CLARK','LIBERTY',
    'LINCOLN','MADISON','MCCONE','MEAGHER','MINERAL','MISSOULA','MUSSELSHELL',
    'PARK','PETROLEUM','PHILLIPS','PONDERA','POWDER RIVER','POWELL','PRAIRIE',
    'RAVALLI','RICHLAND','ROOSEVELT','ROSEBUD','SANDERS','SHERIDAN',
    'SILVER BOW','STILLWATER','SWEET GRASS','TETON','TOOLE','TREASURE',
    'VALLEY','WHEATLAND','WIBAUX','YELLOWSTONE'
  ];
  res.json(counties);
});

// Public lands
app.get('/api/public-lands', async (req, res) => {
  try {
    const { bbox } = req.query;
    if (!bbox) return res.status(400).json({ error: 'bbox required' });
    const data = await queryArcGIS(2, {
      geometry: bbox,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      resultRecordCount: '500',
      where: '1=1'
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Conservation easements
app.get('/api/conservation', async (req, res) => {
  try {
    const { bbox } = req.query;
    if (!bbox) return res.status(400).json({ error: 'bbox required' });
    const data = await queryArcGIS(0, {
      geometry: bbox,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      resultRecordCount: '500',
      where: '1=1'
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Lines running on port ${PORT}`));
