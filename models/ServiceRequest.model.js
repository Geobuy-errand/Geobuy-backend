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
    serviceFee: {
      type: Number,
      default: 1.99,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'quotes_received',
        'negotiating',
        'provider_selected',
        'in_progress',
        'completed',
        'cancelled',
        'expired',
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
    finalPrice: {
      type: Number,
    },
    negotiationHistory: [
      {
        from: {
          type: String,
          enum: ['customer', 'provider', 'system'],
        },
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        message: String,
        offerAmount: Number,
        status: {
          type: String,
          enum: ['sent', 'accepted', 'rejected', 'countered'],
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      }
    ],
    matchedProviders: [
      {
        providerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        matchScore: Number,
        distance: Number,
        responseTime: Number,
        status: {
          type: String,
          enum: ['pending', 'invited', 'responded', 'declined'],
        },
        invitedAt: Date,
        respondedAt: Date,
      }
    ],
    invitedProviders: [
      {
        providerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        matchScore: Number,
        distance: Number,
        status: {
          type: String,
          enum: ['pending', 'invited', 'declined', 'accepted'],
          default: 'pending',
        },
        invitedAt: {
          type: Date,
          default: Date.now,
        },
        quote: {
          amount: Number,
          message: String,
          estimatedDuration: Number,
          submittedAt: Date,
        },
      }
    ],
    selectedProviders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      }
    ],
    isPublic: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
    completedAt: Date,
    cancelledAt: Date,
    cancellationReason: String,
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