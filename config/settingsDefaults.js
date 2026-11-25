// ============================================================
// Default values for every admin-editable setting — the ONE place they live.
//
// The Settings model takes its defaults from here, the services fall back to
// these if a stored value is missing, and "Reset to defaults" restores them.
// To change a value for your platform, use Admin → Settings; edit this file
// only to change what a brand-new installation starts with.
//
// Units: UK distances are in miles, Nigerian distances in km. Money is in
// the country's currency (GBP / NGN).
// ============================================================

const COUNTRY_DEFAULTS = {
  GB: {
    // --- errand prices ---
    baseFee: 3.99,
    minimumFare: 0, // 0 = no minimum
    heavyItemFee: 2.99,
    peakUrgentFee: 1.99,
    extraStopFee: 1.5,
    waitTimeFeePerMin: 0.3,
    waitTimeFreeMin: 5,
    subscriptionDiscount: 20, // %
    distanceTierMode: 'progressive', // 'progressive' | 'flat'
    distanceTiers: [
      { upTo: 3, rate: 0.8 },
      { upTo: 10, rate: 0.7 },
      { upTo: 20, rate: 0.6 },
      { upTo: null, rate: 0.5 }, // beyond the last band
    ],
    // --- Geobuy's share ---
    platformFeePercentage: 20, // % of each errand
    providerCommissionPercentage: 10, // % of each service booking
    connectionFee: 1.99,
    // --- wallets ---
    minWithdrawal: 10,
    maxWithdrawal: 0, // per request; 0 = no limit
    // --- negotiation (errand offers) ---
    negotiationMinPercent: 80, // lowest offer, % of the quoted price
    negotiationMaxPercent: 120, // highest offer, % of the quoted price
    // --- matching ---
    runnerSearchRadius: 15, // miles from the pickup
    providerSearchRadius: 10, // miles, default "providers near me" radius
    // --- distance & travel time ---
    distanceMethod: 'road', // 'road' | 'haversine'
    distanceMultiplier: 1, // haversine only (1–3)
    roadFactor: 1.25, // road ÷ straight-line distance when no routing service answers
    fallbackSpeedKmh: 30, // average speed for travel-time estimates
    trafficMultiplier: 1.2, // added to routing-service travel times
  },
  NG: {
    baseFee: 1500,
    minimumFare: 0,
    heavyItemFee: 1000,
    peakUrgentFee: 1000,
    extraStopFee: 500,
    waitTimeFeePerMin: 50,
    waitTimeFreeMin: 10,
    subscriptionDiscount: 20,
    distanceTierMode: 'progressive',
    distanceTiers: [
      { upTo: 5, rate: 200 },
      { upTo: 15, rate: 150 },
      { upTo: 30, rate: 120 },
      { upTo: null, rate: 100 },
    ],
    platformFeePercentage: 20,
    providerCommissionPercentage: 10,
    connectionFee: 1000,
    minWithdrawal: 1000,
    maxWithdrawal: 0,
    negotiationMinPercent: 80,
    negotiationMaxPercent: 120,
    runnerSearchRadius: 25, // km
    providerSearchRadius: 15, // km
    distanceMethod: 'haversine',
    distanceMultiplier: 1,
    roadFactor: 1.35,
    fallbackSpeedKmh: 20, // Lagos/Abuja traffic
    trafficMultiplier: 1.6,
  },
};

// Both countries. Durations are whole hours/days.
const OPERATIONS_DEFAULTS = {
  serviceRequestExpiryDays: 7, // open provider requests close after this
  quoteExpiryDays: 7, // provider quotes are valid for this long
  negotiationOfferExpiryHours: 24, // errand offers/counter-offers
  maxCounterOffers: 6, // service quotes: counter-offers allowed per quote, both sides (0 = no limit)
  commissionDueDays: 30, // invoices for bookings paid directly to providers
  connectionExpiryDays: 30, // Connect requests
  connectPostExpiryDays: 30, // Connect posts / meeting venues
  qrCodeExpiryHours: 24, // pickup/delivery QR codes
  maxRunnersNotified: 10, // runners alerted about each new errand
  cancellationNoticeHours: 24, // shown in Terms, FAQ and Help
  supportResponseHours: 24, // shown on Contact page and support emails
};

const FEATURE_DEFAULTS = {
  subscriptionsEnabled: true,
  liveTrackingEnabled: true,
  qrCodeEnabled: true,
  negotiationEnabled: true,
  requirePaymentBeforeAcceptance: true,
  autoCompleteHours: 48, // delivered errands / finished jobs confirm themselves (0 = never)
  paystackPayoutsEnabled: true,
};

const PLATFORM_DEFAULTS = {
  name: 'GEOBUY Errands',
  contactEmail: 'support@geobuy.com',
  contactPhone: '+44 20 1234 5678',
  contactEmailNG: 'support.ng@geobuy.com',
  contactPhoneNG: '+234 800 000 0000',
  currency: 'GBP',
  currencySymbol: '£',
  enabledCountries: ['GB', 'NG'],
};

// Identity checks for providers and errand runners.
//   NG: NIN lookup with Dojah.  UK: ID document + selfie with Didit.
//   Set VERIFICATION_MOCK=true in .env to pass every check until real keys are in.
const VERIFICATION_DEFAULTS = {
  requiredForProviders: true, // providers can't quote until verified
  requiredForRunners: true, // runners can't accept errands until verified
  paidBy: 'platform', // 'platform' = Geobuy covers the cost, 'worker' = provider/runner pays a fee first
  feeGB: 1.5, // fee in GBP when paidBy = 'worker'
  feeNG: 500, // fee in NGN when paidBy = 'worker'
  autoApprove: true, // approve as soon as the check passes; false = an admin reviews each result
  maxAttempts: 3, // checks a person can start before an admin must help (0 = no limit)
};

const NOTIFICATION_DEFAULTS = {
  emailEnabled: true,
  pushEnabled: true,
};

// Allowed ranges, used by the model and by the admin form.
const LIMITS = {
  percent: { min: 0, max: 100 },
  distanceMultiplier: { min: 1, max: 3 },
  roadFactor: { min: 1, max: 3 },
  trafficMultiplier: { min: 1, max: 4 },
  fallbackSpeedKmh: { min: 5, max: 120 },
  negotiationMinPercent: { min: 1, max: 100 },
  negotiationMaxPercent: { min: 100, max: 1000 },
};

module.exports = { COUNTRY_DEFAULTS, OPERATIONS_DEFAULTS, FEATURE_DEFAULTS, PLATFORM_DEFAULTS, NOTIFICATION_DEFAULTS, VERIFICATION_DEFAULTS, LIMITS };
