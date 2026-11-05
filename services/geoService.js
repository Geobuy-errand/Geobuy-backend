// ============================================================
// GeoService — geocoding and road-distance calculation for UK and Nigeria
//
// Strategy (best available first):
//   1. Google Distance Matrix / Geocoding  (if GOOGLE_MAPS_API_KEY is set)
//      - uses live traffic for durations (very important in Lagos/Abuja)
//   2. OSRM road routing                   (OSRM_URL, defaults to the public demo server)
//   3. Straight-line (haversine) x country road factor  (never fails)
//
// All distances are returned in KILOMETRES and durations in MINUTES.
// Convert to miles for UK display with config/countries.kmToUnit().
// ============================================================

const axios = require('axios');
const {
  getCountry,
  normalizeCountry,
  isWithinCountry,
  formatDistance,
} = require('../config/countries');

const GOOGLE_KEY = () => process.env.GOOGLE_MAPS_API_KEY;
const OSRM_URL = () => (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const NOMINATIM_URL = () => (process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
const NOMINATIM_UA = () =>
  process.env.NOMINATIM_USER_AGENT || 'GEOBUY-Errands/2.0 (set NOMINATIM_USER_AGENT with a contact email)';

const HTTP_TIMEOUT_MS = 6000;

// Durations from OSRM / straight-line estimates ignore traffic.
// These multipliers bring them closer to real-world times.
const TRAFFIC_MULTIPLIER = { GB: 1.2, NG: 1.6 };

// ------------------------------------------------------------
// Small TTL cache so repeated quotes don't hammer free APIs
// ------------------------------------------------------------
class TTLCache {
  constructor(max = 2000, ttlMs = 15 * 60 * 1000) {
    this.max = max;
    this.ttl = ttlMs;
    this.map = new Map();
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expires) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key, value) {
    if (this.map.size >= this.max) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
    this.map.set(key, { value, expires: Date.now() + this.ttl });
  }
}

const routeCache = new TTLCache();
const geocodeCache = new TTLCache(2000, 24 * 60 * 60 * 1000);

// Nominatim's usage policy allows max 1 request/second.
let nominatimQueue = Promise.resolve();
function throttleNominatim(fn) {
  const run = nominatimQueue.then(fn, fn);
  nominatimQueue = run.then(
    () => new Promise((r) => setTimeout(r, 1100)),
    () => new Promise((r) => setTimeout(r, 1100))
  );
  return run;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function toPoint(p) {
  if (!p) return null;
  const lat = Number(p.lat ?? p.latitude);
  const lng = Number(p.lng ?? p.lon ?? p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // [0,0] is the schema default for "unknown" — never a real location for us.
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** Point from a GeoJSON User.location ({ coordinates: [lng, lat] }). */
function pointFromGeoJSON(location) {
  const coords = location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return toPoint({ lat: coords[1], lng: coords[0] });
}

function haversineKm(a, b) {
  const R = 6371.0088;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function round(v, dp = 2) {
  const f = 10 ** dp;
  return Math.round((Number(v) || 0) * f) / f;
}

function cacheKey(a, b, mode) {
  return `${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}|${mode}`;
}

function estimate(a, b, country) {
  const c = getCountry(country);
  const straight = haversineKm(a, b);
  const km = straight * c.roadFactor;
  const minutes = Math.max(3, (km / c.fallbackSpeedKmh) * 60);
  return { distanceKm: km, durationMin: minutes, straightLineKm: straight, source: 'estimate' };
}

function finalize(result, country) {
  const code = normalizeCountry(country);
  const distanceKm = round(result.distanceKm, 3);
  const durationMin = Math.max(1, Math.round(result.durationMin));
  return {
    distanceKm,
    durationMin,
    distanceText: formatDistance(distanceKm, code),
    durationText: formatDuration(durationMin),
    source: result.source,
    accuracy: result.source === 'estimate' ? 'approximate' : 'road',
    straightLineKm: round(result.straightLineKm, 3),
  };
}

function formatDuration(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} hr ${rest} min` : `${h} hr`;
}

const OSRM_PROFILE = { driving: 'driving', cycling: 'cycling', walking: 'foot', bicycling: 'cycling' };
const GOOGLE_MODE = { driving: 'driving', cycling: 'bicycling', bicycling: 'bicycling', walking: 'walking' };

// ------------------------------------------------------------
// Routing providers
// ------------------------------------------------------------
async function googleRoute(a, b, mode) {
  const { data } = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
    params: {
      origins: `${a.lat},${a.lng}`,
      destinations: `${b.lat},${b.lng}`,
      mode: GOOGLE_MODE[mode] || 'driving',
      units: 'metric',
      departure_time: (GOOGLE_MODE[mode] || 'driving') === 'driving' ? 'now' : undefined,
      key: GOOGLE_KEY(),
    },
    timeout: HTTP_TIMEOUT_MS,
  });
  const el = data?.rows?.[0]?.elements?.[0];
  if (data?.status !== 'OK' || el?.status !== 'OK') {
    throw new Error(`Google distance error: ${data?.status}/${el?.status}`);
  }
  const seconds = el.duration_in_traffic?.value ?? el.duration.value;
  return { distanceKm: el.distance.value / 1000, durationMin: seconds / 60, source: 'google', traffic: true };
}

async function osrmRoute(a, b, mode) {
  const profile = OSRM_PROFILE[mode] || 'driving';
  const { data } = await axios.get(
    `${OSRM_URL()}/route/v1/${profile}/${a.lng},${a.lat};${b.lng},${b.lat}`,
    { params: { overview: 'false', alternatives: 'false', steps: 'false' }, timeout: HTTP_TIMEOUT_MS }
  );
  const route = data?.routes?.[0];
  if (data?.code !== 'Ok' || !route) throw new Error(`OSRM error: ${data?.code}`);
  return { distanceKm: route.distance / 1000, durationMin: route.duration / 60, source: 'osrm' };
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

/**
 * Road distance between two points.
 * @param {{lat,lng}} from
 * @param {{lat,lng}} to
 * @param {{country?: 'GB'|'NG', mode?: 'driving'|'cycling'|'walking'}} opts
 */
async function getRoute(from, to, { country = 'GB', mode = 'driving' } = {}) {
  const a = toPoint(from);
  const b = toPoint(to);
  if (!a || !b) throw new Error('Valid pickup and drop-off coordinates are required');

  const code = normalizeCountry(country);
  const key = cacheKey(a, b, mode);
  const cached = routeCache.get(key);
  if (cached) return cached;

  const straight = haversineKm(a, b);
  let result = null;

  if (straight < 0.05) {
    result = { distanceKm: straight, durationMin: 1, source: 'estimate' };
  }

  if (!result && GOOGLE_KEY()) {
    try {
      result = await googleRoute(a, b, mode);
    } catch (e) {
      console.warn('[geo] Google routing failed:', e.message);
    }
  }

  if (!result) {
    try {
      result = await osrmRoute(a, b, mode);
      result.durationMin *= TRAFFIC_MULTIPLIER[code] || 1;
    } catch (e) {
      console.warn('[geo] OSRM routing failed:', e.message);
    }
  }

  // A road route can never be shorter than the straight line. If a provider
  // snapped to the wrong road and returned nonsense, fall back to the estimate.
  if (result && result.distanceKm < straight * 0.95) {
    console.warn('[geo] Route shorter than straight line, using estimate');
    result = null;
  }

  if (!result) {
    // fallbackSpeedKmh already reflects typical traffic — no extra multiplier.
    result = estimate(a, b, code);
  }

  result.straightLineKm = straight;
  const final = finalize(result, code);
  routeCache.set(key, final);
  return final;
}

/**
 * Distances from one origin to many destinations (provider / runner matching).
 * Returns an array aligned with `destinations`; entries are null when a
 * destination has no usable coordinates.
 */
async function getDistancesFrom(origin, destinations, { country = 'GB', mode = 'driving' } = {}) {
  const a = toPoint(origin);
  const code = normalizeCountry(country);
  const points = destinations.map(toPoint);
  if (!a) return points.map(() => null);

  const valid = points.map((p, i) => ({ p, i })).filter((x) => x.p);
  const out = points.map(() => null);
  if (valid.length === 0) return out;

  // Straight-line estimate first; refined below where possible.
  for (const { p, i } of valid) {
    out[i] = finalize(estimate(a, p, code), code);
  }

  const chunk = (arr, n) => arr.reduce((acc, x, idx) => (idx % n ? acc[acc.length - 1].push(x) : acc.push([x]), acc), []);

  try {
    if (GOOGLE_KEY()) {
      for (const group of chunk(valid, 25)) {
        const { data } = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
          params: {
            origins: `${a.lat},${a.lng}`,
            destinations: group.map(({ p }) => `${p.lat},${p.lng}`).join('|'),
            mode: GOOGLE_MODE[mode] || 'driving',
            units: 'metric',
            departure_time: 'now',
            key: GOOGLE_KEY(),
          },
          timeout: HTTP_TIMEOUT_MS,
        });
        (data?.rows?.[0]?.elements || []).forEach((el, k) => {
          if (el?.status !== 'OK') return;
          const { p, i } = group[k];
          out[i] = finalize(
            {
              distanceKm: el.distance.value / 1000,
              durationMin: (el.duration_in_traffic?.value ?? el.duration.value) / 60,
              source: 'google',
              straightLineKm: haversineKm(a, p),
            },
            code
          );
        });
      }
    } else {
      const profile = OSRM_PROFILE[mode] || 'driving';
      for (const group of chunk(valid, 90)) {
        const coords = [a, ...group.map(({ p }) => p)].map((p) => `${p.lng},${p.lat}`).join(';');
        const { data } = await axios.get(`${OSRM_URL()}/table/v1/${profile}/${coords}`, {
          params: { sources: 0, annotations: 'distance,duration' },
          timeout: HTTP_TIMEOUT_MS,
        });
        const dists = data?.distances?.[0] || [];
        const durs = data?.durations?.[0] || [];
        group.forEach(({ p, i }, k) => {
          const d = dists[k + 1];
          const t = durs[k + 1];
          const straight = haversineKm(a, p);
          if (d == null || t == null || d / 1000 < straight * 0.95) return;
          out[i] = finalize(
            {
              distanceKm: d / 1000,
              durationMin: (t / 60) * (TRAFFIC_MULTIPLIER[code] || 1),
              source: 'osrm',
              straightLineKm: straight,
            },
            code
          );
        });
      }
    }
  } catch (e) {
    console.warn('[geo] Batch distance refinement failed, using estimates:', e.message);
  }

  return out;
}

/**
 * Geocode a free-text address inside a country.
 * Returns { lat, lng, displayName, address, source } or null.
 */
async function geocode(address, { country = 'GB' } = {}) {
  if (!address || String(address).trim().length < 3) return null;
  const code = normalizeCountry(country);
  const c = getCountry(code);
  const key = `${code}|${String(address).trim().toLowerCase()}`;
  const cached = geocodeCache.get(key);
  if (cached !== undefined) return cached;

  let result = null;

  if (GOOGLE_KEY()) {
    try {
      const { data } = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: { address, components: `country:${code}`, key: GOOGLE_KEY() },
        timeout: HTTP_TIMEOUT_MS,
      });
      const r = data?.results?.[0];
      if (r) {
        result = {
          lat: r.geometry.location.lat,
          lng: r.geometry.location.lng,
          displayName: r.formatted_address,
          address: r.address_components,
          source: 'google',
        };
      }
    } catch (e) {
      console.warn('[geo] Google geocode failed:', e.message);
    }
  }

  if (!result) {
    try {
      const { data } = await throttleNominatim(() =>
        axios.get(`${NOMINATIM_URL()}/search`, {
          params: {
            q: address,
            format: 'json',
            limit: 1,
            addressdetails: 1,
            countrycodes: c.geocodeCountryCode,
            'accept-language': 'en',
          },
          headers: { 'User-Agent': NOMINATIM_UA() },
          timeout: HTTP_TIMEOUT_MS,
        })
      );
      const r = Array.isArray(data) ? data[0] : null;
      if (r) {
        result = {
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          displayName: r.display_name,
          address: r.address || {},
          source: 'nominatim',
        };
      }
    } catch (e) {
      console.warn('[geo] Nominatim geocode failed:', e.message);
    }
  }

  if (result && !isWithinCountry(result.lat, result.lng, code)) {
    result = null;
  }

  geocodeCache.set(key, result);
  return result;
}

/** Build a geocodable one-line address from a structured address object. */
function addressToString(addr = {}, country) {
  if (typeof addr === 'string') return addr;
  const parts = [
    addr.address,
    addr.street,
    addr.area,
    addr.lga,
    addr.town || addr.city,
    addr.state,
    addr.postcode,
  ].filter((p) => p && String(p).trim());
  const unique = [...new Set(parts.map((p) => String(p).trim()))];
  if (country) unique.push(getCountry(country).name);
  return unique.join(', ');
}

/**
 * Resolve coordinates for an address-like object. Uses supplied coordinates
 * if they are inside the country, otherwise geocodes.
 */
async function resolvePoint(addr, country) {
  const supplied = toPoint(addr?.coordinates || addr);
  if (supplied && isWithinCountry(supplied.lat, supplied.lng, country)) return { ...supplied, source: 'client' };
  const text = addressToString(addr, country);
  const geo = await geocode(text, { country });
  return geo ? { lat: geo.lat, lng: geo.lng, source: geo.source } : null;
}

module.exports = {
  getRoute,
  getDistancesFrom,
  geocode,
  resolvePoint,
  addressToString,
  haversineKm,
  toPoint,
  pointFromGeoJSON,
  formatDuration,
};
