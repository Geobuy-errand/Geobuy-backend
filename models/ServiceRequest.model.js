const mongoose = require('mongoose');

const serviceRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: String,
      enum: [
        'care',
        'trades',
        'professional',
        'personal',
        'other',
      ],
      required: true,
    },
    serviceType: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    location: {
      address: String,
      street: String,
      town: String,
      postcode: String,
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },
    preferredDate: Date,
    preferredTime: String,
    status: {
      type: String,
      enum: [
        'pending',
        'quotes_received',
        'provider_selected',
        'in_progress',
        'completed',
        'cancelled',
      ],
      default: 'pending',
    },
    selectedProviderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    selectedQuoteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quote',
    },
    budget: {
      type: Number,
    },
    isUrgent: {
      type: Boolean,
      default: false,
    },
    requiresDBS: {
      type: Boolean,
      default: false,
    },
    requiresCertification: {
      type: Boolean,
      default: false,
    },
    completedAt: Date,
    cancelledAt: Date,
  },
  {
    timestamps: true,
  }
);

// Generate request ID before saving
serviceRequestSchema.pre('save', function (next) {
  if (!this.requestId) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    this.requestId = `SR-${year}${month}${day}-${random}`;
  }
  next();
});

module.exports = mongoose.model('ServiceRequest', serviceRequestSchema);