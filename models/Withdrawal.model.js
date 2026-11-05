const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      enum: ['GBP', 'NGN'],
      default: 'GBP',
    },
    country: {
      type: String,
      enum: ['GB', 'NG'],
      default: 'GB',
    },
    gateway: {
      type: String,
      enum: ['manual', 'paystack', 'stripe'],
      default: 'manual',
    },
    transferCode: String, // Paystack transfer code
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'rejected'],
      default: 'pending',
    },
    bankDetails: {
      bankName: String,
      sortCode: String,
      accountNumber: String,
      bankCode: String,
      accountName: String,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reference: String,
    processedAt: Date,
    failedAt: Date,
    failureReason: String,
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Withdrawal', withdrawalSchema);