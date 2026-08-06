const mongoose = require("mongoose");

const errandSchema = new mongoose.Schema(
  {
    errandId: {
      type: String,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    serviceType: {
      type: String,
      enum: [
        "parcel_delivery",
        "document_delivery",
        "prescription_pickup",
        "dry_cleaning_pickup",
        "queue_waiting",
        "shopping",
        "groceries",
        "pharmacy",
        "food_pickup",
        "custom",
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
        "pending",
        "accepted",
        "en_route",
        "collected",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
    estimatedPrice: {
      baseFee: Number,
      distanceFee: Number,
      total: Number,
    },
    // priceBreakdown: {
    //   platformFee: Number,
    //   providerAmount: Number,
    // },
    duration: {
      type: Number,
      default: 0,
    },
    durationText: {
      type: String,
      default: "",
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
    distance: {
      type: Number,
      default: 0,
    },
    distanceText: {
      type: String,
      default: "",
    },
    baseFee: {
      type: Number,
      default: 3.5, // £3.50 base fee
    },
    distanceFeePerMile: {
      type: Number,
      default: 1.6, // £1.60 per mile
    },
    subtotal: {
      type: Number,
      default: 0,
    },
    discountPercentage: {
      type: Number,
      default: 0, // 20% for subscribed users
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      default: 0,
    },
    isSubscribed: {
      type: Boolean,
      default: false,
    },
    distanceRate: {
      type: Number,
      default: 0.8, // Rate per mile
    },
    distanceFee: {
      type: Number,
      default: 0,
    },

    // Additional charges
    heavyItemFee: {
      type: Number,
      default: 0,
    },
    waitTimeFee: {
      type: Number,
      default: 0,
    },
    waitTimeMinutes: {
      type: Number,
      default: 0,
    },
    peakUrgentFee: {
      type: Number,
      default: 0,
    },
    extraStopsFee: {
      type: Number,
      default: 0,
    },
    extraStopsCount: {
      type: Number,
      default: 0,
    },

    // Flags
    isHeavyItem: {
      type: Boolean,
      default: false,
    },
    isPeakUrgent: {
      type: Boolean,
      default: false,
    },
    // Revenue split
    platformFee: {
      type: Number,
      default: 0, // 20% of total
    },
    providerAmount: {
      type: Number,
      default: 0, // 80% of total
    },

    // Wait time tracking
    waitTimeStart: {
      type: Date,
    },
    waitTimeEnd: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to calculate pricing
errandSchema.pre("save", function (next) {
  // Calculate distance fee based on tiered pricing
  const distance = this.distance || 0;
  let ratePerMile = 0.8;

  if (distance <= 3) {
    ratePerMile = 0.8;
  } else if (distance <= 10) {
    ratePerMile = 0.7;
  } else if (distance <= 20) {
    ratePerMile = 0.6;
  } else {
    ratePerMile = 0.5;
  }

  this.distanceRate = ratePerMile;
  this.distanceFee = Math.round(distance * ratePerMile * 100) / 100;

  // Calculate subtotal
  let subtotal = this.baseFee + this.distanceFee;

  // Add heavy item fee
  if (this.isHeavyItem) {
    this.heavyItemFee = 2.99;
    subtotal += this.heavyItemFee;
  }

  // Add wait time fee (first 5 minutes free)
  if (this.waitTimeMinutes > 5) {
    const extraMinutes = this.waitTimeMinutes - 5;
    this.waitTimeFee = Math.round(extraMinutes * 0.3 * 100) / 100;
    subtotal += this.waitTimeFee;
  }

  // Add peak/urgent fee
  if (this.isPeakUrgent) {
    this.peakUrgentFee = 1.99;
    subtotal += this.peakUrgentFee;
  }

  // Add extra stops fee
  if (this.extraStopsCount > 0) {
    this.extraStopsFee = Math.round(this.extraStopsCount * 1.5 * 100) / 100;
    subtotal += this.extraStopsFee;
  }

  this.subtotal = Math.round(subtotal * 100) / 100;

  // Apply subscription discount if applicable
  let discountPercentage = 0;
  let discountAmount = 0;
  let total = this.subtotal;

  if (this.isSubscribed) {
    discountPercentage = 20;
    discountAmount = Math.round(this.subtotal * 0.2 * 100) / 100;
    total = Math.round((this.subtotal - discountAmount) * 100) / 100;
  }

  this.discountPercentage = discountPercentage;
  this.discountAmount = discountAmount;
  this.total = Math.round(total * 100) / 100;

  // Calculate revenue split
  this.platformFee = Math.round(this.total * 0.2 * 100) / 100; // 20%
  this.providerAmount = Math.round(this.total * 0.8 * 100) / 100; // 80%

  next();
});

// Generate errand ID before saving
errandSchema.pre("save", function (next) {
  if (!this.errandId) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    this.errandId = `E-${year}${month}${day}-${random}`;
  }
  next();
});

module.exports = mongoose.model("Errand", errandSchema);
