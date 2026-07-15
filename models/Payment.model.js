const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
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
      default: 0,
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
      enum: ['pending', 'processing', 'succeeded', 'refunded', 'failed'],
      default: 'pending',
    },
    isEscrow: {
      type: Boolean,
      default: true,
    },
    releasedAt: Date,
    refundedAt: Date,
    refundAmount: Number,
    refundReason: String,
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