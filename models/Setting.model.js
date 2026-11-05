const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    // Pricing Settings
    pricing: {
      baseFee: {
        type: Number,
        default: 3.99,
        min: 0,
      },
      connectionFee: {
        type: Number,
        default: 1.99,
        min: 0,
      },
      subscriptionDiscount: {
        type: Number,
        default: 20,
        min: 0,
        max: 100,
      },
      heavyItemFee: {
        type: Number,
        default: 2.99,
        min: 0,
      },
      waitTimeFeePerMin: {
        type: Number,
        default: 0.30,
        min: 0,
      },
      waitTimeFreeMin: {
        type: Number,
        default: 5,
        min: 0,
      },
      peakUrgentFee: {
        type: Number,
        default: 1.99,
        min: 0,
      },
      extraStopFee: {
        type: Number,
        default: 1.50,
        min: 0,
      },
      distanceTiers: {
        tier1: {
          maxMiles: { type: Number, default: 3 },
          ratePerMile: { type: Number, default: 0.80 },
        },
        tier2: {
          maxMiles: { type: Number, default: 10 },
          ratePerMile: { type: Number, default: 0.70 },
        },
        tier3: {
          maxMiles: { type: Number, default: 20 },
          ratePerMile: { type: Number, default: 0.60 },
        },
        tier4: {
          ratePerMile: { type: Number, default: 0.50 },
        },
      },
      platformFeePercentage: {
        type: Number,
        default: 20,
        min: 0,
        max: 100,
      },
      minimumFare: { type: Number, default: 0, min: 0 },
      minWithdrawal: { type: Number, default: 10, min: 0 },
      // progressive: each distance band charged at its own rate (no price drop
      // at band edges). flat: legacy — whole distance at one band's rate.
      distanceTierMode: { type: String, enum: ['progressive', 'flat'], default: 'progressive' },
    },

    // ---------------- Nigeria pricing (NGN, distances in km) ----------------
    pricingNG: {
      baseFee: { type: Number, default: 1500, min: 0 },
      connectionFee: { type: Number, default: 1000, min: 0 },
      subscriptionDiscount: { type: Number, default: 20, min: 0, max: 100 },
      heavyItemFee: { type: Number, default: 1000, min: 0 },
      waitTimeFeePerMin: { type: Number, default: 50, min: 0 },
      waitTimeFreeMin: { type: Number, default: 10, min: 0 },
      peakUrgentFee: { type: Number, default: 1000, min: 0 },
      extraStopFee: { type: Number, default: 500, min: 0 },
      distanceTiers: {
        tier1: {
          maxKm: { type: Number, default: 5 },
          ratePerKm: { type: Number, default: 200 },
        },
        tier2: {
          maxKm: { type: Number, default: 15 },
          ratePerKm: { type: Number, default: 150 },
        },
        tier3: {
          maxKm: { type: Number, default: 30 },
          ratePerKm: { type: Number, default: 120 },
        },
        tier4: {
          ratePerKm: { type: Number, default: 100 },
        },
      },
      platformFeePercentage: { type: Number, default: 20, min: 0, max: 100 },
      minimumFare: { type: Number, default: 0, min: 0 },
      minWithdrawal: { type: Number, default: 1000, min: 0 },
      distanceTierMode: { type: String, enum: ['progressive', 'flat'], default: 'progressive' },
    },

    // Platform Settings
    platform: {
      name: {
        type: String,
        default: 'GEOBUY Errands',
      },
      contactEmail: {
        type: String,
        default: 'support@geobuy.com',
      },
      contactPhone: {
        type: String,
        default: '+44 20 1234 5678',
      },
      currency: {
        type: String,
        default: 'GBP',
      },
      currencySymbol: {
        type: String,
        default: '£',
      },
      contactPhoneNG: {
        type: String,
        default: '+234 800 000 0000',
      },
      contactEmailNG: {
        type: String,
        default: 'support.ng@geobuy.com',
      },
      enabledCountries: {
        type: [String],
        default: ['GB', 'NG'],
      },
    },
    
    // Notification Settings
    notifications: {
      emailEnabled: {
        type: Boolean,
        default: true,
      },
      pushEnabled: {
        type: Boolean,
        default: true,
      },
    },
    
    // Feature Toggles
    features: {
      subscriptionsEnabled: {
        type: Boolean,
        default: true,
      },
      liveTrackingEnabled: {
        type: Boolean,
        default: true,
      },
      qrCodeEnabled: {
        type: Boolean,
        default: true,
      },
      negotiationEnabled: {
        type: Boolean,
        default: true,
      },
      // Customers pay when booking; runners only see paid errands.
      requirePaymentBeforeAcceptance: {
        type: Boolean,
        default: true,
      },
      // Delivered errands the customer never confirms are completed
      // automatically after this many hours (0 = never).
      autoCompleteHours: {
        type: Number,
        default: 48,
        min: 0,
      },
      // Nigeria payouts: admin approves, then Paystack sends the transfer.
      paystackPayoutsEnabled: {
        type: Boolean,
        default: true,
      },
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
settingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);