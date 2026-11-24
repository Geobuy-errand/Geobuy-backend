// Address search used by the app's address boxes and map pin (UK + Nigeria)
const express = require('express');
const rateLimit = require('express-rate-limit');
const addressSearch = require('../services/addressSearch');
const { normalizeCountry } = require('../config/countries');

const router = express.Router();

// Type-ahead fires often; keep it generous but bounded per IP.
const geoLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
router.use(geoLimiter);

const nearFrom = (q) => {
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
};

// GET /api/geo/search?q=admiralty way&country=NG&lat=&lng=&session=
router.get('/search', async (req, res) => {
  const country = normalizeCountry(req.query.country);
  const out = await addressSearch.search(req.query.q, { country, near: nearFrom(req.query), sessionToken: req.query.session });
  res.json(out);
});

// GET /api/geo/place/:id?session=  (coordinates for a Google suggestion)
router.get('/place/:id', async (req, res) => {
  try {
    const place = await addressSearch.details(req.params.id, { sessionToken: req.query.session });
    if (!place || place.lat == null) return res.status(404).json({ message: 'Place not found' });
    res.json(place);
  } catch (e) {
    console.warn('[geo] place details failed:', e.message);
    res.status(502).json({ message: 'Could not load that place. Please choose another suggestion or set it on the map.' });
  }
});

// GET /api/geo/reverse?lat=&lng=&country=
router.get('/reverse', async (req, res) => {
  const result = await addressSearch.reverse(req.query.lat, req.query.lng, { country: normalizeCountry(req.query.country) });
  if (!result) return res.status(400).json({ message: 'Valid lat and lng are required' });
  res.json(result);
});

// GET /api/geo/session — new autocomplete session token
router.get('/session', (req, res) => res.json({ session: addressSearch.newSessionToken() }));

module.exports = router;
