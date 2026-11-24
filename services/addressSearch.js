// ============================================================
// Address search for the app's address boxes (UK + Nigeria)
//
//   search(q)        -> suggestions as the user types
//   details(placeId) -> coordinates for a Google suggestion
//   reverse(lat,lng) -> readable address for a map pin / GPS fix
//
// Providers, best first:
//   1. Google Places (New)   — set GOOGLE_MAPS_API_KEY (Places API (New) +
//                              Geocoding API enabled). Best coverage of
//                              Nigerian streets, estates and landmarks.
//   2. Photon (OpenStreetMap) — free, built for type-ahead (PHOTON_URL to
//                              self-host). Used when there is no Google key
//                              or Google fails.
//   3. Built-in towns/areas  — config/gazetteer.js (always available).
//
// Results are cached for a day, and the browser never calls these
// services directly (keys stay on the server, and no per-user rate limits).
// ============================================================

const axios = require('axios');
const crypto = require('crypto');
const { getCountry, normalizeCountry, isWithinCountry } = require('../config/countries');
const gazetteer = require('../config/gazetteer');

const GOOGLE_KEY = () => process.env.GOOGLE_MAPS_API_KEY;
const PHOTON_URL = () => (process.env.PHOTON_URL || 'https://photon.komoot.io').replace(/\/$/, '');
const NOMINATIM_URL = () => (process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
const USER_AGENT = () => process.env.NOMINATIM_USER_AGENT || `Geobuy/1.0 (${process.env.SUPPORT_EMAIL || 'support@geobuy.com'})`;
const TIMEOUT = 5000;

// ---------------- small TTL cache ----------------
const cache = new Map();
const MAX = 3000;
const TTL = 24 * 60 * 60 * 1000;
const cget = (k) => {
  const v = cache.get(k);
  if (!v) return undefined;
  if (v.exp < Date.now()) {
    cache.delete(k);
    return undefined;
  }
  return v.val;
};
const cset = (k, val) => {
  if (cache.size >= MAX) cache.delete(cache.keys().next().value);
  cache.set(k, { val, exp: Date.now() + TTL });
};

const clean = (parts) => [...new Set(parts.filter((p) => p && String(p).trim()).map((p) => String(p).trim()))];

/** Shape every provider returns. */
function suggestion({ id, provider, label, secondary, lat, lng, components = {}, precision }) {
  return {
    id,
    provider,
    label,
    secondary: secondary || '',
    displayName: [label, secondary].filter(Boolean).join(', '),
    lat: lat ?? null,
    lng: lng ?? null,
    needsDetails: lat == null || lng == null,
    precision: precision || 'street',
    ...components,
  };
}

// ---------------- Google Places (New) ----------------
async function googleAutocomplete(q, country, near, sessionToken) {
  const c = getCountry(country);
  const body = {
    input: q,
    includedRegionCodes: [c.geocodeCountryCode],
    languageCode: 'en',
    sessionToken,
  };
  const center = near || c.defaultCenter;
  body.locationBias = { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: near ? 30000 : 50000 } };

  const { data } = await axios.post('https://places.googleapis.com/v1/places:autocomplete', body, {
    headers: { 'X-Goog-Api-Key': GOOGLE_KEY(), 'Content-Type': 'application/json' },
    timeout: TIMEOUT,
  });
  return (data.suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p) =>
      suggestion({
        id: p.placeId,
        provider: 'google',
        label: p.structuredFormat?.mainText?.text || p.text?.text,
        secondary: p.structuredFormat?.secondaryText?.text,
      })
    );
}

const googleComponent = (comps, ...types) => comps?.find((x) => types.some((t) => x.types?.includes(t)))?.longText || '';

async function googleDetails(placeId, sessionToken) {
  const { data } = await axios.get(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    params: sessionToken ? { sessionToken } : {},
    headers: { 'X-Goog-Api-Key': GOOGLE_KEY(), 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents' },
    timeout: TIMEOUT,
  });
  const comps = data.addressComponents || [];
  return suggestion({
    id: data.id,
    provider: 'google',
    label: data.displayName?.text || data.formattedAddress,
    secondary: data.formattedAddress,
    lat: data.location?.latitude,
    lng: data.location?.longitude,
    components: {
      houseNumber: googleComponent(comps, 'street_number'),
      road: googleComponent(comps, 'route'),
      suburb: googleComponent(comps, 'sublocality', 'sublocality_level_1', 'neighborhood'),
      city: googleComponent(comps, 'locality', 'postal_town', 'administrative_area_level_2'),
      state: googleComponent(comps, 'administrative_area_level_1'),
      postcode: googleComponent(comps, 'postal_code'),
    },
  });
}

async function googleReverse(lat, lng) {
  const { data } = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
    params: { latlng: `${lat},${lng}`, key: GOOGLE_KEY(), language: 'en' },
    timeout: TIMEOUT,
  });
  const r = data?.results?.[0];
  if (!r) return null;
  const comps = (r.address_components || []).map((x) => ({ longText: x.long_name, types: x.types }));
  return {
    displayName: r.formatted_address,
    houseNumber: googleComponent(comps, 'street_number'),
    road: googleComponent(comps, 'route'),
    suburb: googleComponent(comps, 'sublocality', 'sublocality_level_1', 'neighborhood'),
    city: googleComponent(comps, 'locality', 'postal_town', 'administrative_area_level_2'),
    state: googleComponent(comps, 'administrative_area_level_1'),
    postcode: googleComponent(comps, 'postal_code'),
  };
}

// ---------------- Photon (OpenStreetMap) ----------------
function photonToSuggestion(f, country) {
  const p = f.properties || {};
  const [lng, lat] = f.geometry?.coordinates || [];
  const road = p.street || (p.osm_key === 'highway' ? p.name : '');
  const name = p.name && p.name !== road ? p.name : '';
  const line1 = clean([name, [p.housenumber, road].filter(Boolean).join(' ')]).join(', ') || p.name || p.district || p.city;
  const secondary = clean([p.district || p.locality, p.city || p.county, p.state, p.postcode]).filter((x) => x !== line1).join(', ');
  const precision = p.housenumber || road || ['amenity', 'shop', 'building', 'office', 'tourism', 'leisure'].includes(p.osm_key) ? 'street' : ['suburb', 'neighbourhood', 'quarter', 'district'].includes(p.type || p.osm_value) ? 'area' : ['city', 'town', 'village'].includes(p.type || p.osm_value) ? 'town' : p.type === 'state' ? 'state' : 'area';
  return suggestion({
    id: `osm:${p.osm_type || ''}${p.osm_id || `${lat},${lng}`}`,
    provider: 'osm',
    label: line1,
    secondary,
    lat,
    lng,
    precision,
    components: {
      houseNumber: p.housenumber || '',
      road: road || '',
      suburb: p.district || p.locality || '',
      city: p.city || p.county || '',
      state: p.state || '',
      postcode: p.postcode || '',
    },
  });
}

async function photonSearch(q, country, near) {
  const c = getCountry(country);
  const b = c.bounds;
  const center = near || c.defaultCenter;
  const { data } = await axios.get(`${PHOTON_URL()}/api/`, {
    params: { q, limit: 8, lang: 'en', bbox: `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`, lat: center.lat, lon: center.lng },
    headers: { 'User-Agent': USER_AGENT() },
    timeout: TIMEOUT,
  });
  const code = normalizeCountry(country);
  return (data.features || [])
    .filter((f) => {
      const [lng, lat] = f.geometry?.coordinates || [];
      const cc = (f.properties?.countrycode || '').toUpperCase();
      return (!cc || cc === code) && isWithinCountry(lat, lng, code);
    })
    .map((f) => photonToSuggestion(f, code));
}

async function nominatimReverse(lat, lng) {
  const { data } = await axios.get(`${NOMINATIM_URL()}/reverse`, {
    params: { lat, lon: lng, format: 'json', addressdetails: 1, 'accept-language': 'en' },
    headers: { 'User-Agent': USER_AGENT() },
    timeout: TIMEOUT,
  });
  if (!data || data.error) return null;
  const a = data.address || {};
  return {
    displayName: data.display_name,
    houseNumber: a.house_number || '',
    road: a.road || '',
    suburb: a.suburb || a.neighbourhood || a.quarter || '',
    city: a.city || a.town || a.village || a.county || '',
    state: a.state || '',
    postcode: a.postcode || '',
  };
}

// ---------------- built-in list ----------------
function gazetteerSuggestions(q, country) {
  const c = getCountry(country);
  return gazetteer.suggest(q, normalizeCountry(country)).map((p) =>
    suggestion({
      id: `local:${p.name}`,
      provider: 'local',
      label: p.name,
      secondary: clean([p.state, c.name]).join(', '),
      lat: p.lat,
      lng: p.lng,
      precision: p.kind === 'area' ? 'area' : 'town',
      components: { suburb: p.kind === 'area' ? p.name : '', city: p.kind === 'town' ? p.name : '', state: p.state || '' },
    })
  );
}

// ============================================================
// Public API
// ============================================================

/** Suggestions for what the user has typed. Never throws. */
async function search(q, { country = 'GB', near, sessionToken } = {}) {
  const code = normalizeCountry(country);
  const query = String(q || '').trim().slice(0, 200);
  if (query.length < 2) return { provider: 'none', results: [] };

  const key = `s|${code}|${query.toLowerCase()}|${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ''}`;
  const hit = cget(key);
  if (hit) return hit;

  let results = [];
  let provider = 'local';
  if (GOOGLE_KEY()) {
    try {
      results = await googleAutocomplete(query, code, near, sessionToken);
      provider = 'google';
    } catch (e) {
      console.warn('[address] Google autocomplete failed:', e.response?.data?.error?.message || e.message);
    }
  }
  if (!results.length) {
    try {
      results = await photonSearch(query, code, near);
      provider = 'osm';
    } catch (e) {
      console.warn('[address] Photon search failed:', e.message);
    }
  }

  // Add matching towns/areas the providers didn't return
  const local = gazetteerSuggestions(query, code).filter(
    (l) => !results.some((r) => r.label?.toLowerCase() === l.label.toLowerCase())
  );
  const out = { provider: results.length ? provider : 'local', results: [...results.slice(0, 6), ...local.slice(0, results.length ? 2 : 6)] };
  if (results.length) cset(key, out); // don't cache provider outages
  return out;
}

/** Coordinates for a suggestion that didn't include them (Google). */
async function details(placeId, { sessionToken } = {}) {
  if (!placeId) return null;
  const key = `d|${placeId}`;
  const hit = cget(key);
  if (hit) return hit;
  if (!GOOGLE_KEY()) return null;
  const result = await googleDetails(placeId, sessionToken);
  if (result?.lat != null) cset(key, result);
  return result;
}

/** Readable address for a point (map pin / GPS). Never throws. */
async function reverse(lat, lng, { country = 'GB' } = {}) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  const key = `r|${la.toFixed(5)},${ln.toFixed(5)}`;
  const hit = cget(key);
  if (hit) return hit;

  let result = null;
  if (GOOGLE_KEY()) {
    try {
      result = await googleReverse(la, ln);
    } catch (e) {
      console.warn('[address] Google reverse failed:', e.message);
    }
  }
  if (!result) {
    try {
      result = await nominatimReverse(la, ln);
    } catch (e) {
      console.warn('[address] Nominatim reverse failed:', e.message);
    }
  }
  if (!result) {
    // Name the nearest known area so the pin still has a label
    const code = normalizeCountry(country);
    let best = null;
    for (const [name, p] of Object.entries(gazetteer.PLACES[code] || {})) {
      const d = (p.lat - la) ** 2 + (p.lng - ln) ** 2;
      if (!best || d < best.d) best = { d, name, ...p };
    }
    result = {
      displayName: best ? `Pinned location near ${best.name}${best.state ? `, ${best.state}` : ''}` : `Pinned location (${la.toFixed(5)}, ${ln.toFixed(5)})`,
      suburb: best?.kind === 'area' ? best.name : '',
      city: best?.kind === 'town' ? best.name : '',
      state: best?.state || '',
    };
  } else {
    cset(key, result);
  }
  return { ...result, lat: la, lng: ln };
}

/** A fresh session token (Google bills an autocomplete session + details as one). */
const newSessionToken = () => crypto.randomUUID();

module.exports = { search, details, reverse, newSessionToken, photonToSuggestion };
