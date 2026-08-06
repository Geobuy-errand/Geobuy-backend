const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    pendingBalance: {
      type: Number,
      default: 0,
    },
    totalEarned: {
      type: Number,
      default: 0,
    },
    totalWithdrawn: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'GBP',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Stripe Connect account
    stripeAccountId: {
      type: String,
    },
    stripeAccountStatus: {
      type: String,
      enum: ['pending', 'active', 'disabled'],
      default: 'pending',
    },
    payoutSchedule: {
      type: String,
      enum: ['instant', 'daily', 'weekly', 'monthly'],
      default: 'daily',
    },
    lastPayoutDate: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Wallet', walletSchema);