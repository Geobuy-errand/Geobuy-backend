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
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    bankDetails: {
      bankName: String,
      sortCode: String,
      accountNumber: String,
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