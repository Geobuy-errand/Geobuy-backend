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