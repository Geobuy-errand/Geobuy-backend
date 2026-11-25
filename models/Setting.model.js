const mongoose = require('mongoose');
const {
  COUNTRY_DEFAULTS,
  OPERATIONS_DEFAULTS,
  FEATURE_DEFAULTS,
  PLATFORM_DEFAULTS,
  NOTIFICATION_DEFAULTS,
  VERIFICATION_DEFAULTS,
  LIMITS,
} = require('../config/settingsDefaults');

// ============================================================
// Platform settings — a single document, edited in Admin → Settings.
// All defaults come from config/settingsDefaults.js.
// ============================================================

const money = (def) => ({ type: Number, default: def, min: 0 });
const count = (def) => ({ type: Number, default: def, min: 0 });
const percent = (def) => ({ type: Number, default: def, ...LIMITS.percent });
const ranged = (def, key) => ({ type: Number, default: def, ...LIMITS[key] });

/** Pricing block for one country. UK tiers are in miles, Nigerian tiers in km. */
function countryPricing(code) {
  const d = COUNTRY_DEFAULTS[code];
  const maxKey = code === 'NG' ? 'maxKm' : 'maxMiles';
  const rateKey = code === 'NG' ? 'ratePerKm' : 'ratePerMile';
  const tier = (i, last = false) => ({
    ...(last ? {} : { [maxKey]: { type: Number, default: d.distanceTiers[i].upTo } }),
    [rateKey]: { type: Number, default: d.distanceTiers[i].rate },
  });

  return {
    // errand prices
    baseFee: money(d.baseFee),
    minimumFare: money(d.minimumFare),
    heavyItemFee: money(d.heavyItemFee),
    peakUrgentFee: money(d.peakUrgentFee),
    extraStopFee: money(d.extraStopFee),
    waitTimeFeePerMin: money(d.waitTimeFeePerMin),
    waitTimeFreeMin: count(d.waitTimeFreeMin),
    subscriptionDiscount: percent(d.subscriptionDiscount),
    // progressive: each distance band charged at its own rate (no price drop
    // at band edges). flat: legacy — whole distance at one band's rate.
    distanceTierMode: { type: String, enum: ['progressive', 'flat'], default: d.distanceTierMode },
    distanceTiers: { tier1: tier(0), tier2: tier(1), tier3: tier(2), tier4: tier(3, true) },

    // Geobuy's share
    platformFeePercentage: percent(d.platformFeePercentage),
    providerCommissionPercentage: percent(d.providerCommissionPercentage),
    connectionFee: money(d.connectionFee),

    // wallets
    minWithdrawal: money(d.minWithdrawal),
    maxWithdrawal: money(d.maxWithdrawal), // 0 = no limit

    // negotiation band (% of the quoted price)
    negotiationMinPercent: ranged(d.negotiationMinPercent, 'negotiationMinPercent'),
    negotiationMaxPercent: ranged(d.negotiationMaxPercent, 'negotiationMaxPercent'),

    // matching radii (country's unit)
    runnerSearchRadius: count(d.runnerSearchRadius),
    providerSearchRadius: count(d.providerSearchRadius),

    // distance & travel time
    //   road      — road routing (Google / OSRM), haversine only as a fallback
    //   haversine — straight-line distance (Haversine formula) x distanceMultiplier
    distanceMethod: { type: String, enum: ['road', 'haversine'], default: d.distanceMethod },
    distanceMultiplier: ranged(d.distanceMultiplier, 'distanceMultiplier'),
    roadFactor: ranged(d.roadFactor, 'roadFactor'),
    fallbackSpeedKmh: ranged(d.fallbackSpeedKmh, 'fallbackSpeedKmh'),
    trafficMultiplier: ranged(d.trafficMultiplier, 'trafficMultiplier'),
  };
}

const fromDefaults = (defaults, type = Number) =>
  Object.fromEntries(
    Object.entries(defaults).map(([k, v]) => [
      k,
      Array.isArray(v) ? { type: [String], default: v } : { type: typeof v === 'boolean' ? Boolean : typeof v === 'string' ? String : type, default: v, ...(typeof v === 'number' ? { min: 0 } : {}) },
    ])
  );

const settingsSchema = new mongoose.Schema(
  {
    pricing: countryPricing('GB'), // United Kingdom (GBP, miles)
    pricingNG: countryPricing('NG'), // Nigeria (NGN, km)
    operations: fromDefaults(OPERATIONS_DEFAULTS), // time limits & policies (both countries)
    platform: fromDefaults(PLATFORM_DEFAULTS),
    notifications: fromDefaults(NOTIFICATION_DEFAULTS),
    features: fromDefaults(FEATURE_DEFAULTS),
    verification: {
      ...fromDefaults(VERIFICATION_DEFAULTS),
      paidBy: { type: String, enum: ['platform', 'worker'], default: VERIFICATION_DEFAULTS.paidBy },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Only allow one settings document
settingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);
