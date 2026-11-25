// ============================================================
// PricingService — the ONE place errand prices are calculated.
// Used by the quote endpoint (what the customer sees) and by errand
// creation (what the customer pays), so the two can never disagree.
// ============================================================

const Settings = require('../models/Setting.model');
const Subscription = require('../models/Subscription.model');
const SubscriptionPlan = require('../models/SubscriptionPlan.model');
const { getCountry, normalizeCountry, kmToUnit } = require('../config/countries');
const { round2 } = require('../utils/money');

const { COUNTRY_DEFAULTS, LIMITS } = require('../config/settingsDefaults');

// Fallback values if a settings document is missing fields
// (single source: config/settingsDefaults.js).
const DEFAULT_PRICING = COUNTRY_DEFAULTS;

const num = (v, fallback) => (v === undefined || v === null || Number.isNaN(Number(v)) ? fallback : Number(v));

/** Normalise the legacy tier shape ({tier1:{maxMiles,ratePerMile}...}) into [{upTo, rate}]. */
function normaliseTiers(raw, fallback) {
  if (!raw) return fallback;
  if (Array.isArray(raw)) return raw.length ? raw : fallback;
  const t = typeof raw.toObject === 'function' ? raw.toObject() : raw;
  const keys = ['tier1', 'tier2', 'tier3', 'tier4'];
  const tiers = keys
    .filter((k) => t[k])
    .map((k, idx) => ({
      upTo: idx === keys.length - 1 ? null : num(t[k].maxMiles ?? t[k].maxKm, null),
      rate: num(t[k].ratePerMile ?? t[k].ratePerKm, 0),
    }));
  if (!tiers.length) return fallback;
  tiers[tiers.length - 1].upTo = null;
  return tiers;
}

const ENUMS = {
  distanceMethod: ['road', 'haversine'],
  distanceTierMode: ['progressive', 'flat'],
};
const clamp = (v, key) => (LIMITS[key] ? Math.min(LIMITS[key].max, Math.max(LIMITS[key].min, v)) : v);

/**
 * Pricing config for a country: every admin setting for that country,
 * merged over the defaults. Adding a field to config/settingsDefaults.js
 * (and the model) is enough for it to appear here.
 */
async function getPricing(country) {
  const code = normalizeCountry(country);
  const defaults = DEFAULT_PRICING[code];
  const settings = await Settings.getSettings();
  const raw = code === 'NG' ? settings.pricingNG : settings.pricing;
  const p = raw ? (typeof raw.toObject === 'function' ? raw.toObject() : raw) : {};

  const out = { country: code, currency: getCountry(code).currency, distanceUnit: getCountry(code).distanceUnit };
  for (const [key, def] of Object.entries(defaults)) {
    if (key === 'distanceTiers') out.distanceTiers = normaliseTiers(p.distanceTiers, def);
    else if (ENUMS[key]) out[key] = ENUMS[key].includes(p[key]) ? p[key] : def;
    else if (typeof def === 'number') out[key] = clamp(num(p[key], def), key);
    else out[key] = p[key] ?? def;
  }
  // a band that can't be satisfied falls back to the defaults
  if (out.negotiationMinPercent > out.negotiationMaxPercent) {
    out.negotiationMinPercent = defaults.negotiationMinPercent;
    out.negotiationMaxPercent = defaults.negotiationMaxPercent;
  }
  return out;
}

/**
 * Distance fee.
 *  - progressive (default): each band is charged at its own rate, like tax bands.
 *    No price drops when you cross a band boundary.
 *  - flat (legacy UK behaviour): the whole distance at the rate of the band it falls in.
 */
function distanceFeeFor(distance, tiers, mode = 'progressive') {
  const d = Math.max(0, Number(distance) || 0);
  if (mode === 'flat') {
    const tier = tiers.find((t) => t.upTo === null || d <= t.upTo) || tiers[tiers.length - 1];
    return { fee: round2(d * tier.rate), effectiveRate: tier.rate };
  }
  let remaining = d;
  let lower = 0;
  let fee = 0;
  for (const t of tiers) {
    if (remaining <= 0) break;
    const bandSize = t.upTo === null ? remaining : Math.max(0, t.upTo - lower);
    const used = Math.min(remaining, bandSize);
    fee += used * t.rate;
    remaining -= used;
    if (t.upTo !== null) lower = t.upTo;
  }
  return { fee: round2(fee), effectiveRate: d > 0 ? round2(fee / d) : tiers[0]?.rate || 0 };
}

/** Subscription discount % for a user (0 when not subscribed). */
async function getSubscriptionDiscount(userId, pricing) {
  if (!userId) return { isSubscribed: false, discountPercentage: 0 };
  const sub = await Subscription.findOne({
    userId,
    status: { $in: ['active', 'trialing'] },
    $or: [{ currentPeriodEnd: { $exists: false } }, { currentPeriodEnd: null }, { currentPeriodEnd: { $gt: new Date() } }],
  }).lean();
  if (!sub) return { isSubscribed: false, discountPercentage: 0 };
  let discount = pricing.subscriptionDiscount;
  if (sub.plan) {
    const plan = await SubscriptionPlan.findById(sub.plan).lean();
    if (plan?.features?.discount) discount = Number(plan.features.discount);
  }
  return { isSubscribed: true, discountPercentage: Math.max(0, Math.min(100, discount)) };
}

/**
 * Full errand price.
 * @param {object} input
 * @param {'GB'|'NG'} input.country
 * @param {number} input.distanceKm   road distance in km
 */
async function calculateErrandPrice({
  country,
  distanceKm,
  isHeavyItem = false,
  isPeakUrgent = false,
  extraStopsCount = 0,
  waitTimeMinutes = 0,
  userId = null,
}) {
  const pricing = await getPricing(country);
  const distanceInUnit = kmToUnit(Number(distanceKm) || 0, pricing.country);

  const { fee: distanceFee, effectiveRate } = distanceFeeFor(
    distanceInUnit,
    pricing.distanceTiers,
    pricing.distanceTierMode
  );

  const stops = Math.max(0, Math.min(10, parseInt(extraStopsCount, 10) || 0));
  const waitMin = Math.max(0, Math.min(240, Number(waitTimeMinutes) || 0));

  const heavyItemFee = isHeavyItem ? pricing.heavyItemFee : 0;
  const peakUrgentFee = isPeakUrgent ? pricing.peakUrgentFee : 0;
  const extraStopsFee = round2(stops * pricing.extraStopFee);
  const waitTimeFee =
    waitMin > pricing.waitTimeFreeMin ? round2((waitMin - pricing.waitTimeFreeMin) * pricing.waitTimeFeePerMin) : 0;

  let subtotal = round2(pricing.baseFee + distanceFee + heavyItemFee + peakUrgentFee + extraStopsFee + waitTimeFee);
  if (pricing.minimumFare && subtotal < pricing.minimumFare) subtotal = pricing.minimumFare;

  const { isSubscribed, discountPercentage } = await getSubscriptionDiscount(userId, pricing);
  const discountAmount = round2((subtotal * discountPercentage) / 100);
  const total = round2(subtotal - discountAmount);

  const platformFee = round2((total * pricing.platformFeePercentage) / 100);
  const providerAmount = round2(total - platformFee);

  return {
    country: pricing.country,
    currency: pricing.currency,
    distanceUnit: pricing.distanceUnit,
    distance: round2(distanceInUnit),
    distanceKm: round2(distanceKm),
    baseFee: pricing.baseFee,
    distanceRate: effectiveRate,
    distanceFee,
    distanceTierMode: pricing.distanceTierMode,
    heavyItemFee,
    peakUrgentFee,
    extraStopsCount: stops,
    extraStopsFee,
    waitTimeMinutes: waitMin,
    waitTimeFee,
    subtotal,
    isSubscribed,
    discountPercentage,
    discountAmount,
    total,
    platformFeePercentage: pricing.platformFeePercentage,
    platformFee,
    providerAmount,
  };
}

/** Split any amount into platform fee and provider share for a country. */
async function splitAmount(amount, country) {
  const pricing = await getPricing(country);
  const total = round2(amount);
  const platformFee = round2((total * pricing.platformFeePercentage) / 100);
  return { platformFee, providerAmount: round2(total - platformFee), platformFeePercentage: pricing.platformFeePercentage };
}

/** Split a provider (service) booking: Geobuy commission vs the provider's share. */
async function splitServiceAmount(amount, country) {
  const pricing = await getPricing(country);
  const total = round2(amount);
  const rate = pricing.providerCommissionPercentage;
  const platformFee = round2((total * rate) / 100);
  return { platformFee, providerAmount: round2(total - platformFee), platformFeePercentage: rate };
}

module.exports = {
  DEFAULT_PRICING,
  splitServiceAmount,
  getPricing,
  distanceFeeFor,
  calculateErrandPrice,
  getSubscriptionDiscount,
  splitAmount,
};
