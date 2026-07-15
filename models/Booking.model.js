const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    bookingId: {
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
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },
    serviceType: {
      type: String,
      required: true,
    },
    customRequest: String,
    pickup: {
      address: String,
      street: String,
      town: String,
      postcode: String,
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },
    destination: {
      address: String,
      street: String,
      town: String,
      postcode: String,
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },
    date: {
      type: Date,
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    description: String,
    photos: [String],
    estimatedPrice: {
      type: Number,
      required: true,
    },
    finalPrice: Number,
    status: {
      type: String,
      enum: [
        'pending',
        'accepted',
        'in_progress',
        'completed',
        'cancelled',
        'rejected',
      ],
      default: 'pending',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'pending',
    },
    paymentIntentId: String,
    customerLocation: {
      lat: Number,
      lng: Number,
    },
    providerLocation: {
      lat: Number,
      lng: Number,
    },
    startedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    cancellationReason: String,
    cancelledBy: String,
    distance: Number,
    duration: Number,
    notes: String,
    specialInstructions: String,
  },
  {
    timestamps: true,
  }
);

// Generate booking ID before saving
bookingSchema.pre('save', function (next) {
  if (!this.bookingId) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    this.bookingId = `GB-${year}${month}${day}-${random}`;
  }
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);