const Settings = require('../models/Setting.model');
const pricingService = require('../services/pricingService');
const { COUNTRIES, normalizeCountry } = require('../config/countries');

const settingsService = require('../services/settingsService');
const { COUNTRY_DEFAULTS } = require('../config/settingsDefaults');

// Every per-country pricing setting is safe to show publicly
// (the list follows config/settingsDefaults.js automatically).
const PUBLIC_PRICING_FIELDS = Object.keys(COUNTRY_DEFAULTS.GB);

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
      features: await settingsService.getFeatures(),
      // Time limits & policies shown in the app (QR expiry, cancellation notice, …)
      operations: await settingsService.getOperations(),
      // Who pays for ID checks and how much, for this country
      verification: await (async () => {
        const v = await settingsService.getVerification();
        return {
          requiredForProviders: v.requiredForProviders,
          requiredForRunners: v.requiredForRunners,
          paidBy: v.paidBy,
          fee: country === 'NG' ? v.feeNG : v.feeGB,
          provider: 'didit',
        };
      })(),
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

// PUT /settings — admin. Accepts { pricing, pricingNG, operations, platform, notifications, features }
exports.updateSettings = async (req, res) => {
  try {
    const { pricing, pricingNG, operations, platform, notifications, features, verification } = req.body;
    const settings = await Settings.getSettings();

    // The old code spread Mongoose subdocuments (`{...settings.pricing}`),
    // which copies internal fields rather than values.
    mergeInto(settings, 'pricing', pricing);
    mergeInto(settings, 'pricingNG', pricingNG);
    mergeInto(settings, 'operations', operations);
    mergeInto(settings, 'platform', platform);
    mergeInto(settings, 'notifications', notifications);
    mergeInto(settings, 'features', features);
    mergeInto(settings, 'verification', verification);

    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    // Cross-field checks the schema can't express
    for (const key of ['pricing', 'pricingNG']) {
      const p = settings[key] || {};
      if (Number(p.negotiationMinPercent) > Number(p.negotiationMaxPercent)) {
        return res.status(400).json({ message: 'Negotiation: the lowest offer % must not be above the highest offer %' });
      }
      if (Number(p.maxWithdrawal) > 0 && Number(p.maxWithdrawal) < Number(p.minWithdrawal)) {
        return res.status(400).json({ message: 'Maximum withdrawal must be 0 (no limit) or at least the minimum withdrawal' });
      }
    }

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
