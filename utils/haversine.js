// ============================================================
// Haversine formula — great-circle ("as the crow flies") distance
// between two latitude/longitude points on the Earth's surface.
//
//   a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
//   c = 2 · atan2(√a, √(1−a))
//   d = R · c
//
// φ = latitude, λ = longitude (in radians), R = Earth's mean radius.
// Accurate to within ~0.5% anywhere on Earth, which is far smaller than
// the error from geocoding an address.
// ============================================================

const EARTH_RADIUS_KM = 6371.0088; // IUGG mean Earth radius

const toRadians = (deg) => (Number(deg) * Math.PI) / 180;

/**
 * Distance in kilometres between two points.
 * @param {{lat:number,lng:number}} a
 * @param {{lat:number,lng:number}} b
 * @returns {number} kilometres (NaN if either point is invalid)
 */
function haversineKm(a, b) {
  const lat1 = Number(a?.lat);
  const lng1 = Number(a?.lng);
  const lat2 = Number(b?.lat);
  const lng2 = Number(b?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return NaN;

  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lng2 - lng1);

  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

module.exports = { haversineKm, EARTH_RADIUS_KM };
