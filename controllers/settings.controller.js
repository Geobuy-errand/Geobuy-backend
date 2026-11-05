const Settings = require('../models/Setting.model');
const pricingService = require('../services/pricingService');
const { COUNTRIES, normalizeCountry } = require('../config/countries');

const PUBLIC_PRICING_FIELDS = [
  'baseFee',
  'connectionFee',
  'subscriptionDiscount',
  'heavyItemFee',
  'waitTimeFeePerMin',
  'waitTimeFreeMin',
  'peakUrgentFee',
  'extraStopFee',
  'distanceTiers',
  'platformFeePercentage',
  'minimumFare',
  'minWithdrawal',
  'distanceTierMode',
];

function pickPricing(p) {
  const obj = p?.toObject ? p.toObject() : p || {};
  return Object.fromEntries(PUBLIC_PRICING_FIELDS.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
}

/** Deep-merge plain objects into a Mongoose subdocument path. */
function mergeInto(doc, path, incoming) {
  if (!incoming || typeof incoming !== 'object') return;
  const current = doc.get(path);
  const base = current?.toObject ? current.toObject() : current || {};
  const merge = (a, b) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
      out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a?.[k] || {}, v) : v;
    }
    return out;
  };
  doc.set(path, merge(base, incoming));
}

// GET /settings/public?country=NG — public pricing for one country (default UK)
exports.getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    const country = normalizeCountry(req.query.country);
    const c = COUNTRIES[country];
    const effective = await pricingService.getPricing(country);

    res.json({
      country,
      currency: c.currency,
      currencySymbol: c.currencySymbol,
      distanceUnit: c.distanceUnit,
      pricing: {
        ...pickPricing(country === 'NG' ? settings.pricingNG : settings.pricing),
        // Normalised tiers: [{ upTo, rate }] in the country's unit
        tiers: effective.distanceTiers,
      },
      // Both countries, so the UI can show a country switcher with prices
      pricingByCountry: {
        GB: pickPricing(settings.pricing),
        NG: pickPricing(settings.pricingNG),
      },
      platform: {
        name: settings.platform.name,
        currencySymbol: c.currencySymbol,
        contactEmail: country === 'NG' ? settings.platform.contactEmailNG : settings.platform.contactEmail,
        contactPhone: country === 'NG' ? settings.platform.contactPhoneNG : settings.platform.contactPhone,
        enabledCountries: settings.platform.enabledCountries || ['GB', 'NG'],
      },
      features: settings.features,
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: error.message });
  }
};

// GET /settings — admin
exports.getAllSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json(settings);
  } catch (error) {
    console.error('Get all settings error:', error);
    res.status(500).json({ message: error.message });
  }
};

// PUT /settings — admin. Accepts { pricing, pricingNG, platform, notifications, features }
exports.updateSettings = async (req, res) => {
  try {
    const { pricing, pricingNG, platform, notifications, features } = req.body;
    const settings = await Settings.getSettings();

    // The old code spread Mongoose subdocuments (`{...settings.pricing}`),
    // which copies internal fields rather than values.
    mergeInto(settings, 'pricing', pricing);
    mergeInto(settings, 'pricingNG', pricingNG);
    mergeInto(settings, 'platform', platform);
    mergeInto(settings, 'notifications', notifications);
    mergeInto(settings, 'features', features);

    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();

    res.json({ message: 'Settings updated successfully', settings });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(error.name === 'ValidationError' ? 400 : 500).json({ message: error.message });
  }
};

// POST /settings/reset — admin
exports.resetSettings = async (req, res) => {
  try {
    await Settings.deleteMany({});
    const settings = await Settings.getSettings();
    res.json({ message: 'Settings reset to defaults', settings });
  } catch (error) {
    console.error('Reset settings error:', error);
    res.status(500).json({ message: error.message });
  }
};
