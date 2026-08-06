const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    errandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Errand',
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    platformFee: {
      type: Number,
      required: true,
    },
    providerAmount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'GBP',
    },
    paymentIntentId: String,
    paymentMethod: {
      type: String,
      default: 'card',
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'succeeded', 'released', 'refunded', 'failed'],
      default: 'pending',
    },
    isEscrow: {
      type: Boolean,
      default: true,
    },
    // Disbursement tracking
    disbursementStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    disbursementDate: Date,
    disbursementReference: String,
    releasedAt: Date,
    refundedAt: Date,
    refundAmount: Number,
    refundReason: String,
    // Stripe connect account IDs
    platformAccountId: String, // GEOBUY's Stripe account
    providerAccountId: String, // Provider's Stripe Connect account
    stripeSessionId: String,
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Payment', paymentSchema);