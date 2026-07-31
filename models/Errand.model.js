const mongoose = require('mongoose');

const errandSchema = new mongoose.Schema(
  {
    errandId: {
      type: String,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    serviceType: {
      type: String,
      enum: [
        'parcel_delivery',
        'document_delivery',
        'prescription_pickup',
        'dry_cleaning_pickup',
        'queue_waiting',
        'shopping',
        'groceries',
        'pharmacy',
        'food_pickup',
        'custom',
      ],
      required: true,
    },
    pickup: {
      address: String,
      street: String,
      town: String,
      postcode: String,
      coordinates: {
        lat: Number,
        lng: Number,
      },
      instructions: String,
    },
    dropoff: {
      address: String,
      street: String,
      town: String,
      postcode: String,
      coordinates: {
        lat: Number,
        lng: Number,
      },
      instructions: String,
    },
    taskDetails: {
      type: String,
      maxlength: 500,
    },
    preferredDate: {
      type: Date,
      required: true,
    },
    preferredTime: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'accepted',
        'en_route',
        'collected',
        'delivered',
        'cancelled',
      ],
      default: 'pending',
    },
    estimatedPrice: {
      baseFee: Number,
      distanceFee: Number,
      total: Number,
    },
    priceBreakdown: {
      platformFee: Number,
      providerAmount: Number,
    },
    distance: {
      type: Number,
      default: 0,
    },
    duration: {
      type: Number,
      default: 0,
    },
    locationUpdates: [
      {
        lat: Number,
        lng: Number,
        timestamp: Date,
        status: String,
      },
    ],
    acceptedAt: Date,
    enRouteAt: Date,
    collectedAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,
    cancellationReason: String,
    cancelledBy: String,
    requiresLiveTracking: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Generate errand ID before saving
errandSchema.pre('save', function (next) {
  if (!this.errandId) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    this.errandId = `E-${year}${month}${day}-${random}`;
  }
  next();
});

module.exports = mongoose.model('Errand', errandSchema);