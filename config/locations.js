// ============================================================
// Region lists used by the Connect feature and address forms.
// Keep in sync with the frontend copy: src/config/locations.js
// ============================================================

const UK_REGIONS = [
  // Regions
  'England', 'Scotland', 'Wales', 'Northern Ireland',
  // Major cities
  'London', 'Manchester', 'Birmingham', 'Liverpool',
  'Bristol', 'Sheffield', 'Leeds', 'Newcastle',
  'Nottingham', 'Southampton', 'Brighton', 'Oxford',
  'Cambridge', 'York', 'Bath', 'Edinburgh', 'Glasgow',
  'Aberdeen', 'Dundee', 'Cardiff', 'Swansea', 'Belfast',
  'Derry', 'Reading', 'Leicester', 'Coventry', 'Stoke',
  'Wolverhampton', 'Plymouth', 'Exeter', 'Bournemouth',
  'Portsmouth', 'Norwich', 'Peterborough', 'Chelmsford',
  'Colchester', 'St Albans', 'All UK',
];

// 36 states + FCT, with their main cities / commercial areas
const NG_STATES = {
  Abia: ['Umuahia', 'Aba', 'Ohafia', 'Arochukwu'],
  Adamawa: ['Yola', 'Mubi', 'Jimeta', 'Numan'],
  'Akwa Ibom': ['Uyo', 'Eket', 'Ikot Ekpene', 'Oron'],
  Anambra: ['Awka', 'Onitsha', 'Nnewi', 'Ekwulobia', 'Ihiala'],
  Bauchi: ['Bauchi', 'Azare', 'Misau', 'Jama\'are'],
  Bayelsa: ['Yenagoa', 'Brass', 'Ogbia', 'Sagbama'],
  Benue: ['Makurdi', 'Gboko', 'Otukpo', 'Katsina-Ala'],
  Borno: ['Maiduguri', 'Biu', 'Bama', 'Monguno'],
  'Cross River': ['Calabar', 'Ikom', 'Ogoja', 'Ugep'],
  Delta: ['Asaba', 'Warri', 'Sapele', 'Ughelli', 'Agbor'],
  Ebonyi: ['Abakaliki', 'Afikpo', 'Onueke'],
  Edo: ['Benin City', 'Auchi', 'Ekpoma', 'Uromi'],
  Ekiti: ['Ado-Ekiti', 'Ikere-Ekiti', 'Ikole', 'Ijero'],
  Enugu: ['Enugu', 'Nsukka', 'Agbani', 'Oji River', 'Udi'],
  'Federal Capital Territory': ['Abuja', 'Garki', 'Wuse', 'Maitama', 'Asokoro', 'Gwarinpa', 'Kubwa', 'Lugbe', 'Gwagwalada'],
  Gombe: ['Gombe', 'Kaltungo', 'Billiri'],
  Imo: ['Owerri', 'Orlu', 'Okigwe', 'Mbaise'],
  Jigawa: ['Dutse', 'Hadejia', 'Gumel', 'Kazaure'],
  Kaduna: ['Kaduna', 'Zaria', 'Kafanchan', 'Kagoro'],
  Kano: ['Kano', 'Wudil', 'Gaya', 'Rano'],
  Katsina: ['Katsina', 'Funtua', 'Daura', 'Malumfashi'],
  Kebbi: ['Birnin Kebbi', 'Argungu', 'Yauri', 'Zuru'],
  Kogi: ['Lokoja', 'Okene', 'Idah', 'Kabba', 'Anyigba'],
  Kwara: ['Ilorin', 'Offa', 'Omu-Aran', 'Jebba'],
  Lagos: [
    'Ikeja', 'Lekki', 'Victoria Island', 'Ikoyi', 'Lagos Island', 'Surulere', 'Yaba', 'Ajah',
    'Ikorodu', 'Festac', 'Apapa', 'Maryland', 'Gbagada', 'Magodo', 'Ogba', 'Ojota', 'Ketu',
    'Egbeda', 'Ikotun', 'Isolo', 'Oshodi', 'Mushin', 'Agege', 'Alimosho', 'Badagry', 'Epe', 'Sangotedo',
  ],
  Nasarawa: ['Lafia', 'Keffi', 'Akwanga', 'Karu', 'Masaka'],
  Niger: ['Minna', 'Bida', 'Suleja', 'Kontagora'],
  Ogun: ['Abeokuta', 'Ijebu-Ode', 'Sagamu', 'Ota', 'Mowe', 'Ibafo', 'Ilaro'],
  Ondo: ['Akure', 'Ondo', 'Owo', 'Ikare'],
  Osun: ['Osogbo', 'Ile-Ife', 'Ilesa', 'Ede', 'Iwo'],
  Oyo: ['Ibadan', 'Ogbomosho', 'Oyo', 'Iseyin', 'Saki'],
  Plateau: ['Jos', 'Bukuru', 'Pankshin', 'Shendam'],
  Rivers: ['Port Harcourt', 'Obio-Akpor', 'Bonny', 'Eleme', 'Omoku', 'Oyigbo'],
  Sokoto: ['Sokoto', 'Tambuwal', 'Wurno'],
  Taraba: ['Jalingo', 'Wukari', 'Bali', 'Takum'],
  Yobe: ['Damaturu', 'Potiskum', 'Gashua', 'Nguru'],
  Zamfara: ['Gusau', 'Kaura Namoda', 'Talata Mafara'],
};

const NG_REGIONS = [...Object.keys(NG_STATES), 'All Nigeria'];

const ALL_REGIONS = [...UK_REGIONS, ...NG_REGIONS];

const LOOKUP = new Map(ALL_REGIONS.map((r) => [r.toLowerCase().replace(/[\s_-]+/g, ' '), r]));
LOOKUP.set('fct', 'Federal Capital Territory');
LOOKUP.set('abuja', 'Federal Capital Territory');
LOOKUP.set('all uk', 'All UK');
LOOKUP.set('newcastle upon tyne', 'Newcastle');
LOOKUP.set('stoke on trent', 'Stoke');

/** 'london' / 'st_albans' / 'FCT' -> 'London' / 'St Albans' / 'Federal Capital Territory' */
function canonicalRegion(input) {
  if (input === undefined || input === null) return input;
  const key = String(input).trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  return LOOKUP.get(key) || String(input).trim();
}

function regionsForCountry(country) {
  return String(country).toUpperCase() === 'NG' ? NG_REGIONS : UK_REGIONS;
}

module.exports = { UK_REGIONS, NG_STATES, NG_REGIONS, ALL_REGIONS, regionsForCountry, canonicalRegion };
