const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    gateway: {
      type: String,
      enum: ['stripe', 'paystack'],
      default: 'stripe',
    },
    country: {
      type: String,
      enum: ['GB', 'NG'],
      default: 'GB',
    },
    currency: {
      type: String,
      enum: ['GBP', 'NGN'],
      default: 'GBP',
    },
    amount: Number,
    stripeCustomerId: {
      type: String,
    },
    // Paystack
    paystackCustomerCode: String,
    paystackSubscriptionCode: { type: String, index: true, sparse: true },
    paystackEmailToken: String,
    paystackPlanCode: String,
    lastReference: String,
    stripeSubscriptionId: {
      type: String,
    },
    stripePriceId: {
      type: String,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: true,

    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'canceled', 'past_due', 'trialing', 'incomplete'],
      default: 'inactive',
    },
    currentPeriodStart: {
      type: Date,
    },
    currentPeriodEnd: {
      type: Date,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    canceledAt: {
      type: Date,
    },
    trialStart: {
      type: Date,
    },
    trialEnd: {
      type: Date,
    },
    features: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ stripeCustomerId: 1 });
subscriptionSchema.index({ status: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);