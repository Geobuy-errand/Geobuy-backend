// ============================================================
// Supported countries
// Everything that differs between the UK and Nigeria lives here so the
// rest of the code can stay country-agnostic.
// ============================================================

const COUNTRIES = {
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    currency: 'GBP',
    currencySymbol: '£',
    minorUnit: 100, // pence
    locale: 'en-GB',
    distanceUnit: 'mi',
    distanceUnitLabel: 'miles',
    paymentGateway: 'stripe',
    phonePrefix: '+44',
    geocodeCountryCode: 'gb',
    // Average ratio of road distance to straight-line distance.
    // Used only when no routing service is reachable.
    roadFactor: 1.25,
    // Average urban driving speed (km/h) used only as a last-resort ETA.
    fallbackSpeedKmh: 30,
    bounds: { minLat: 49.8, maxLat: 60.95, minLng: -8.7, maxLng: 1.8 },
    defaultCenter: { lat: 51.5074, lng: -0.1278 }, // London
    timezone: 'Europe/London',
    supportPhone: '+44 20 1234 5678',
  },
  NG: {
    code: 'NG',
    name: 'Nigeria',
    currency: 'NGN',
    currencySymbol: '₦',
    minorUnit: 100, // kobo
    locale: 'en-NG',
    distanceUnit: 'km',
    distanceUnitLabel: 'km',
    paymentGateway: 'paystack',
    phonePrefix: '+234',
    geocodeCountryCode: 'ng',
    roadFactor: 1.35,
    fallbackSpeedKmh: 20, // Lagos/Abuja traffic
    bounds: { minLat: 4.0, maxLat: 14.0, minLng: 2.6, maxLng: 14.8 },
    defaultCenter: { lat: 6.5244, lng: 3.3792 }, // Lagos
    timezone: 'Africa/Lagos',
    supportPhone: '+234 800 000 0000',
  },
};

const DEFAULT_COUNTRY = 'GB';
const SUPPORTED_COUNTRIES = Object.keys(COUNTRIES);

const KM_PER_MILE = 1.609344;

/** Normalise any user input ("ng", "Nigeria", "UK", "gb") to a supported code. */
function normalizeCountry(input) {
  if (!input) return DEFAULT_COUNTRY;
  const value = String(input).trim().toUpperCase();
  if (COUNTRIES[value]) return value;
  if (['UK', 'UNITED KINGDOM', 'GREAT BRITAIN', 'ENGLAND', 'SCOTLAND', 'WALES'].includes(value)) return 'GB';
  if (['NIGERIA', 'NGA'].includes(value)) return 'NG';
  return DEFAULT_COUNTRY;
}

function isSupportedCountry(input) {
  if (!input) return false;
  const value = String(input).trim().toUpperCase();
  return Boolean(COUNTRIES[value]) || ['UK', 'NIGERIA'].includes(value);
}

function getCountry(code) {
  return COUNTRIES[normalizeCountry(code)];
}

function getCountryByCurrency(currency) {
  const cur = String(currency || '').toUpperCase();
  return Object.values(COUNTRIES).find((c) => c.currency === cur) || COUNTRIES[DEFAULT_COUNTRY];
}

/** Country of a user document (defaults to GB for accounts created before Nigeria support). */
function countryOfUser(user) {
  return normalizeCountry(user?.country);
}

/** Is a coordinate inside the country's rough bounding box? */
function isWithinCountry(lat, lng, code) {
  const c = getCountry(code);
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  return la >= c.bounds.minLat && la <= c.bounds.maxLat && ln >= c.bounds.minLng && ln <= c.bounds.maxLng;
}

/** Guess the country from a coordinate. Returns null when outside every supported country. */
function countryFromCoordinates(lat, lng) {
  return SUPPORTED_COUNTRIES.find((code) => isWithinCountry(lat, lng, code)) || null;
}

/** Convert kilometres to the country's display unit. */
function kmToUnit(km, code) {
  const c = getCountry(code);
  return c.distanceUnit === 'mi' ? km / KM_PER_MILE : km;
}

function unitToKm(value, code) {
  const c = getCountry(code);
  return c.distanceUnit === 'mi' ? value * KM_PER_MILE : value;
}

function formatDistance(km, code) {
  const c = getCountry(code);
  const v = kmToUnit(km, code);
  return `${(Math.round(v * 10) / 10).toFixed(1)} ${c.distanceUnitLabel}`;
}

module.exports = {
  COUNTRIES,
  DEFAULT_COUNTRY,
  SUPPORTED_COUNTRIES,
  KM_PER_MILE,
  normalizeCountry,
  isSupportedCountry,
  getCountry,
  getCountryByCurrency,
  countryOfUser,
  isWithinCountry,
  countryFromCoordinates,
  kmToUnit,
  unitToKm,
  formatDistance,
};
