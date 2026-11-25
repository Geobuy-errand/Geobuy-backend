// ============================================================
// Read admin settings that aren't country pricing (see pricingService for
// prices). Every value falls back to config/settingsDefaults.js.
// ============================================================
const Settings = require('../models/Setting.model');
const { OPERATIONS_DEFAULTS, FEATURE_DEFAULTS, PLATFORM_DEFAULTS, VERIFICATION_DEFAULTS } = require('../config/settingsDefaults');

const plain = (v) => (v && typeof v.toObject === 'function' ? v.toObject() : v || {});

function merge(defaults, stored) {
  const out = {};
  for (const [k, def] of Object.entries(defaults)) {
    const v = stored[k];
    if (typeof def === 'number') out[k] = v === undefined || v === null || Number.isNaN(Number(v)) ? def : Math.max(0, Number(v));
    else out[k] = v === undefined || v === null ? def : v;
  }
  return out;
}

/** Time limits and policies (both countries). */
async function getOperations() {
  const s = await Settings.getSettings();
  return merge(OPERATIONS_DEFAULTS, plain(s.operations));
}

async function getFeatures() {
  const s = await Settings.getSettings();
  return merge(FEATURE_DEFAULTS, plain(s.features));
}

async function getVerification() {
  const s = await Settings.getSettings();
  return merge(VERIFICATION_DEFAULTS, plain(s.verification));
}

async function getPlatform() {
  const s = await Settings.getSettings();
  return merge(PLATFORM_DEFAULTS, plain(s.platform));
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Date `n` hours / days from now. */
const hoursFromNow = (n) => new Date(Date.now() + Number(n) * HOUR);
const daysFromNow = (n) => new Date(Date.now() + Number(n) * DAY);

module.exports = { getOperations, getFeatures, getPlatform, getVerification, hoursFromNow, daysFromNow, HOUR, DAY };
