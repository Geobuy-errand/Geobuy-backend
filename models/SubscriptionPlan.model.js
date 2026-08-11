const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    interval: {
      type: String,
      enum: ['month', 'year'],
      required: true,
      default: 'month',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    stripePriceId: {
      type: String,
      required: true,
    },
    features: {
      unlimited_errands: {
        type: Boolean,
        default: true,
      },
      priority_support: {
        type: Boolean,
        default: false,
      },
      discount: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      advanced_tracking: {
        type: Boolean,
        default: false,
      },
      business_analytics: {
        type: Boolean,
        default: false,
      },
      dedicated_account_manager: {
        type: Boolean,
        default: false,
      },
      custom_feature_1: {
        type: Boolean,
        default: false,
      },
      custom_feature_2: {
        type: Boolean,
        default: false,
      },
      custom_feature_3: {
        type: Boolean,
        default: false,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
subscriptionPlanSchema.index({ isActive: 1 });
subscriptionPlanSchema.index({ displayOrder: 1 });

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);