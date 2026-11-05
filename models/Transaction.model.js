const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['payment', 'payout', 'fee', 'refund', 'adjustment'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      enum: ['GBP', 'NGN'],
      default: 'GBP',
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    description: String,
    reference: String,
    stripeTransactionId: String,
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
    completedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Generate transaction ID before saving
transactionSchema.pre('save', function (next) {
  if (!this.transactionId) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    // The old 4-digit suffix caused duplicate-key errors once a day had a few
    // dozen transactions.
    const random = require('crypto').randomBytes(5).toString('hex').toUpperCase();
    this.transactionId = `TXN-${year}${month}${day}-${random}`;
  }
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);