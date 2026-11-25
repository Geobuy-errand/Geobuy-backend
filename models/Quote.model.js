const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema(
  {
    serviceRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceRequest',
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
    message: {
      type: String,
      maxlength: 500,
    },
    // Negotiation: the provider's first price, who made the latest offer
    // (the other side must respond) and how many counter-offers were made.
    originalAmount: Number,
    lastOfferBy: {
      type: String,
      enum: ['provider', 'customer'],
      default: 'provider',
    },
    counterCount: {
      type: Number,
      default: 0,
    },
    estimatedDuration: {
      type: Number, // in hours
    },
    availability: {
      startDate: Date,
      endDate: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'expired'],
      default: 'pending',
    },
    isSelected: {
      type: Boolean,
      default: false,
    },
    selectedAt: Date,
    expiresAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Quote', quoteSchema);