// ============================================================
// Built-in list of towns and neighbourhoods with approximate centre points.
//
// Used as the last fallback when no map service can find an address, so a
// customer who types "12 Admiralty Way, Lekki" still gets a (clearly marked
// approximate) price instead of an error. Also gives instant suggestions.
//
// kind: 'area' = neighbourhood (good enough for an approximate price)
//       'town' = whole town/city (approximate; user is asked to refine)
// ============================================================

const NG = {
  // ---- Lagos ----
  Ikeja: { lat: 6.6018, lng: 3.3515, state: 'Lagos', kind: 'area' },
  'Allen Avenue': { lat: 6.6008, lng: 3.358, state: 'Lagos', kind: 'area' },
  Opebi: { lat: 6.596, lng: 3.365, state: 'Lagos', kind: 'area' },
  Alausa: { lat: 6.617, lng: 3.359, state: 'Lagos', kind: 'area' },
  Oregun: { lat: 6.6, lng: 3.36, state: 'Lagos', kind: 'area' },
  Ogba: { lat: 6.625, lng: 3.342, state: 'Lagos', kind: 'area' },
  Agege: { lat: 6.615, lng: 3.32, state: 'Lagos', kind: 'area' },
  Ojodu: { lat: 6.64, lng: 3.37, state: 'Lagos', kind: 'area' },
  Ketu: { lat: 6.595, lng: 3.39, state: 'Lagos', kind: 'area' },
  Ojota: { lat: 6.587, lng: 3.383, state: 'Lagos', kind: 'area' },
  Ogudu: { lat: 6.577, lng: 3.392, state: 'Lagos', kind: 'area' },
  Magodo: { lat: 6.6203, lng: 3.3814, state: 'Lagos', kind: 'area' },
  Maryland: { lat: 6.5725, lng: 3.3667, state: 'Lagos', kind: 'area' },
  Anthony: { lat: 6.56, lng: 3.37, state: 'Lagos', kind: 'area' },
  Gbagada: { lat: 6.5536, lng: 3.3869, state: 'Lagos', kind: 'area' },
  Ilupeju: { lat: 6.553, lng: 3.357, state: 'Lagos', kind: 'area' },
  Oshodi: { lat: 6.5568, lng: 3.3491, state: 'Lagos', kind: 'area' },
  Isolo: { lat: 6.53, lng: 3.322, state: 'Lagos', kind: 'area' },
  Mushin: { lat: 6.527, lng: 3.35, state: 'Lagos', kind: 'area' },
  Surulere: { lat: 6.4969, lng: 3.3539, state: 'Lagos', kind: 'area' },
  Yaba: { lat: 6.5095, lng: 3.3711, state: 'Lagos', kind: 'area' },
  'Ebute Metta': { lat: 6.488, lng: 3.38, state: 'Lagos', kind: 'area' },
  'Lagos Island': { lat: 6.4541, lng: 3.3947, state: 'Lagos', kind: 'area' },
  Obalende: { lat: 6.448, lng: 3.404, state: 'Lagos', kind: 'area' },
  Ikoyi: { lat: 6.4549, lng: 3.4366, state: 'Lagos', kind: 'area' },
  'Victoria Island': { lat: 6.4281, lng: 3.4219, state: 'Lagos', kind: 'area' },
  Lekki: { lat: 6.4474, lng: 3.4723, state: 'Lagos', kind: 'area' },
  'Lekki Phase 1': { lat: 6.4474, lng: 3.4723, state: 'Lagos', kind: 'area' },
  Chevron: { lat: 6.4387, lng: 3.5323, state: 'Lagos', kind: 'area' },
  Ikota: { lat: 6.445, lng: 3.545, state: 'Lagos', kind: 'area' },
  Ajah: { lat: 6.4698, lng: 3.5852, state: 'Lagos', kind: 'area' },
  Sangotedo: { lat: 6.4716, lng: 3.6269, state: 'Lagos', kind: 'area' },
  Apapa: { lat: 6.4489, lng: 3.3594, state: 'Lagos', kind: 'area' },
  Festac: { lat: 6.4667, lng: 3.2833, state: 'Lagos', kind: 'area' },
  Ojo: { lat: 6.46, lng: 3.18, state: 'Lagos', kind: 'area' },
  Ikotun: { lat: 6.55, lng: 3.27, state: 'Lagos', kind: 'area' },
  Egbeda: { lat: 6.5917, lng: 3.2914, state: 'Lagos', kind: 'area' },
  Ipaja: { lat: 6.61, lng: 3.26, state: 'Lagos', kind: 'area' },
  Ikorodu: { lat: 6.6194, lng: 3.5105, state: 'Lagos', kind: 'town' },
  Epe: { lat: 6.584, lng: 3.983, state: 'Lagos', kind: 'town' },
  Badagry: { lat: 6.415, lng: 2.887, state: 'Lagos', kind: 'town' },

  // ---- FCT ----
  Abuja: { lat: 9.0765, lng: 7.3986, state: 'Federal Capital Territory', kind: 'town' },
  'Central Business District': { lat: 9.056, lng: 7.489, state: 'Federal Capital Territory', kind: 'area' },
  Wuse: { lat: 9.0579, lng: 7.4691, state: 'Federal Capital Territory', kind: 'area' },
  'Wuse 2': { lat: 9.079, lng: 7.479, state: 'Federal Capital Territory', kind: 'area' },
  Maitama: { lat: 9.0882, lng: 7.4934, state: 'Federal Capital Territory', kind: 'area' },
  Garki: { lat: 9.0333, lng: 7.4833, state: 'Federal Capital Territory', kind: 'area' },
  Asokoro: { lat: 9.043, lng: 7.527, state: 'Federal Capital Territory', kind: 'area' },
  Utako: { lat: 9.07, lng: 7.44, state: 'Federal Capital Territory', kind: 'area' },
  Jabi: { lat: 9.072, lng: 7.422, state: 'Federal Capital Territory', kind: 'area' },
  'Life Camp': { lat: 9.0817, lng: 7.389, state: 'Federal Capital Territory', kind: 'area' },
  Gwarinpa: { lat: 9.1099, lng: 7.4042, state: 'Federal Capital Territory', kind: 'area' },
  Kubwa: { lat: 9.1561, lng: 7.3222, state: 'Federal Capital Territory', kind: 'area' },
  Lugbe: { lat: 8.9806, lng: 7.3711, state: 'Federal Capital Territory', kind: 'area' },
  Apo: { lat: 8.994, lng: 7.501, state: 'Federal Capital Territory', kind: 'area' },

  // ---- Rivers ----
  'Port Harcourt': { lat: 4.8156, lng: 7.0498, state: 'Rivers', kind: 'town' },
  'Trans-Amadi': { lat: 4.81, lng: 7.04, state: 'Rivers', kind: 'area' },
  Rumuokoro: { lat: 4.87, lng: 6.99, state: 'Rivers', kind: 'area' },

  // ---- Other cities and state capitals ----
  Ibadan: { lat: 7.3775, lng: 3.947, state: 'Oyo', kind: 'town' },
  Kano: { lat: 12.0022, lng: 8.592, state: 'Kano', kind: 'town' },
  Enugu: { lat: 6.4584, lng: 7.5464, state: 'Enugu', kind: 'town' },
  Nsukka: { lat: 6.8567, lng: 7.3958, state: 'Enugu', kind: 'town' },
  'Benin City': { lat: 6.335, lng: 5.6037, state: 'Edo', kind: 'town' },
  Kaduna: { lat: 10.5105, lng: 7.4165, state: 'Kaduna', kind: 'town' },
  Zaria: { lat: 11.0855, lng: 7.7199, state: 'Kaduna', kind: 'town' },
  Owerri: { lat: 5.484, lng: 7.0351, state: 'Imo', kind: 'town' },
  Onitsha: { lat: 6.1498, lng: 6.7857, state: 'Anambra', kind: 'town' },
  Awka: { lat: 6.2104, lng: 7.0741, state: 'Anambra', kind: 'town' },
  Nnewi: { lat: 6.0177, lng: 6.9178, state: 'Anambra', kind: 'town' },
  Abeokuta: { lat: 7.1475, lng: 3.3619, state: 'Ogun', kind: 'town' },
  Ota: { lat: 6.6804, lng: 3.2356, state: 'Ogun', kind: 'town' },
  'Ijebu Ode': { lat: 6.8194, lng: 3.9173, state: 'Ogun', kind: 'town' },
  Uyo: { lat: 5.0377, lng: 7.9128, state: 'Akwa Ibom', kind: 'town' },
  Calabar: { lat: 4.9757, lng: 8.3417, state: 'Cross River', kind: 'town' },
  Jos: { lat: 9.8965, lng: 8.8583, state: 'Plateau', kind: 'town' },
  Ilorin: { lat: 8.4799, lng: 4.5418, state: 'Kwara', kind: 'town' },
  Warri: { lat: 5.5167, lng: 5.75, state: 'Delta', kind: 'town' },
  Asaba: { lat: 6.1985, lng: 6.7319, state: 'Delta', kind: 'town' },
  Akure: { lat: 7.2571, lng: 5.2058, state: 'Ondo', kind: 'town' },
  'Ado-Ekiti': { lat: 7.6211, lng: 5.2214, state: 'Ekiti', kind: 'town' },
  Aba: { lat: 5.1066, lng: 7.3667, state: 'Abia', kind: 'town' },
  Umuahia: { lat: 5.5249, lng: 7.4942, state: 'Abia', kind: 'town' },
  Abakaliki: { lat: 6.3249, lng: 8.1137, state: 'Ebonyi', kind: 'town' },
  Osogbo: { lat: 7.7827, lng: 4.5418, state: 'Osun', kind: 'town' },
  'Ile-Ife': { lat: 7.4824, lng: 4.5603, state: 'Osun', kind: 'town' },
  Maiduguri: { lat: 11.8311, lng: 13.151, state: 'Borno', kind: 'town' },
  Sokoto: { lat: 13.0059, lng: 5.2476, state: 'Sokoto', kind: 'town' },
  Yola: { lat: 9.2035, lng: 12.4954, state: 'Adamawa', kind: 'town' },
  Makurdi: { lat: 7.7322, lng: 8.5391, state: 'Benue', kind: 'town' },
  Minna: { lat: 9.6139, lng: 6.5569, state: 'Niger', kind: 'town' },
  Lokoja: { lat: 7.8023, lng: 6.743, state: 'Kogi', kind: 'town' },
  Yenagoa: { lat: 4.9267, lng: 6.2676, state: 'Bayelsa', kind: 'town' },
  Lafia: { lat: 8.4939, lng: 8.515, state: 'Nasarawa', kind: 'town' },
  Gombe: { lat: 10.2897, lng: 11.1673, state: 'Gombe', kind: 'town' },
  Bauchi: { lat: 10.3158, lng: 9.8442, state: 'Bauchi', kind: 'town' },
  Jalingo: { lat: 8.8833, lng: 11.3667, state: 'Taraba', kind: 'town' },
  Damaturu: { lat: 11.747, lng: 11.9608, state: 'Yobe', kind: 'town' },
  Dutse: { lat: 11.7562, lng: 9.3388, state: 'Jigawa', kind: 'town' },
  Katsina: { lat: 12.9908, lng: 7.6017, state: 'Katsina', kind: 'town' },
  'Birnin Kebbi': { lat: 12.4539, lng: 4.1975, state: 'Kebbi', kind: 'town' },
  Gusau: { lat: 12.1628, lng: 6.6614, state: 'Zamfara', kind: 'town' },
};

const GB = {
  London: { lat: 51.5074, lng: -0.1278, kind: 'town' },
  Manchester: { lat: 53.4808, lng: -2.2426, kind: 'town' },
  Birmingham: { lat: 52.4862, lng: -1.8904, kind: 'town' },
  Liverpool: { lat: 53.4084, lng: -2.9916, kind: 'town' },
  Bristol: { lat: 51.4545, lng: -2.5879, kind: 'town' },
  Sheffield: { lat: 53.3811, lng: -1.4701, kind: 'town' },
  Leeds: { lat: 53.8008, lng: -1.5491, kind: 'town' },
  Newcastle: { lat: 54.9783, lng: -1.6174, kind: 'town' },
  Nottingham: { lat: 52.9548, lng: -1.1581, kind: 'town' },
  Southampton: { lat: 50.9097, lng: -1.4044, kind: 'town' },
  Brighton: { lat: 50.8225, lng: -0.1372, kind: 'town' },
  Oxford: { lat: 51.752, lng: -1.2577, kind: 'town' },
  Cambridge: { lat: 52.2053, lng: 0.1218, kind: 'town' },
  York: { lat: 53.96, lng: -1.0873, kind: 'town' },
  Bath: { lat: 51.3758, lng: -2.3599, kind: 'town' },
  Edinburgh: { lat: 55.9533, lng: -3.1883, kind: 'town' },
  Glasgow: { lat: 55.8642, lng: -4.2518, kind: 'town' },
  Aberdeen: { lat: 57.1497, lng: -2.0943, kind: 'town' },
  Dundee: { lat: 56.462, lng: -2.9707, kind: 'town' },
  Cardiff: { lat: 51.4816, lng: -3.1791, kind: 'town' },
  Swansea: { lat: 51.6214, lng: -3.9436, kind: 'town' },
  Belfast: { lat: 54.5973, lng: -5.9301, kind: 'town' },
  Derry: { lat: 54.9966, lng: -7.3086, kind: 'town' },
  Reading: { lat: 51.4543, lng: -0.9781, kind: 'town' },
  Leicester: { lat: 52.6369, lng: -1.1398, kind: 'town' },
  Coventry: { lat: 52.4068, lng: -1.5197, kind: 'town' },
  Plymouth: { lat: 50.3755, lng: -4.1427, kind: 'town' },
  Exeter: { lat: 50.7184, lng: -3.5339, kind: 'town' },
  Norwich: { lat: 52.6309, lng: 1.2974, kind: 'town' },
  'Milton Keynes': { lat: 52.0406, lng: -0.7594, kind: 'town' },
};

const PLACES = { NG, GB };

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Find the most specific known place mentioned in a free-text address.
 * "12 Admiralty Way, Lekki Phase 1, Lagos" -> Lekki Phase 1 (area).
 * Returns { name, lat, lng, state, precision: 'area'|'town' } or null.
 */
function lookup(text, country = 'NG') {
  const list = PLACES[country === 'NG' ? 'NG' : 'GB'];
  const hay = ` ${norm(text)} `;
  if (!hay.trim()) return null;
  let best = null;
  for (const [name, p] of Object.entries(list)) {
    const needle = ` ${norm(name)} `;
    if (!hay.includes(needle)) continue;
    const score = (p.kind === 'area' ? 1000 : 0) + needle.length + (p.state && hay.includes(` ${norm(p.state)} `) ? 50 : 0);
    if (!best || score > best.score) best = { score, name, ...p };
  }
  if (!best) return null;
  return { name: best.name, lat: best.lat, lng: best.lng, state: best.state, precision: best.kind === 'area' ? 'area' : 'town' };
}

/** Places whose name starts with / contains the query (instant suggestions). */
function suggest(query, country = 'NG', limit = 6) {
  const q = norm(query);
  if (q.length < 2) return [];
  const list = PLACES[country === 'NG' ? 'NG' : 'GB'];
  return Object.entries(list)
    .filter(([name, p]) => norm(name).includes(q) || (p.state && norm(p.state).includes(q)))
    .sort(([a], [b]) => (norm(b).startsWith(q) ? 1 : 0) - (norm(a).startsWith(q) ? 1 : 0))
    .slice(0, limit)
    .map(([name, p]) => ({ name, ...p }));
}

module.exports = { PLACES, lookup, suggest };
