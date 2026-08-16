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