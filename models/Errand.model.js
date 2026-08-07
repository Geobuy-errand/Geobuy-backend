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
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "released", "refunded"],
      default: "pending",
    },
    paymentIntentId: String,
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
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
    negotiationStatus: {
      type: String,
      enum: ["open", "negotiating", "accepted", "rejected", "expired"],
      default: "open",
    },
    minPrice: {
      type: Number,
    },
    maxPrice: {
      type: Number,
    },
    currentOffer: {
      providerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      amount: Number,
      message: String,
      offeredAt: Date,
      expiresAt: Date,
    },
    offers: [
      {
        providerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        amount: Number,
        message: String,
        status: {
          type: String,
          enum: ["pending", "accepted", "rejected", "countered", "expired"],
          default: "pending",
        },
        offeredAt: {
          type: Date,
          default: Date.now,
        },
        expiresAt: Date,
        counterOffers: [
          {
            amount: Number,
            message: String,
            offeredAt: {
              type: Date,
              default: Date.now,
            },
          },
        ],
      },
    ],
    acceptedOffer: {
      providerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      amount: Number,
      acceptedAt: Date,
    },
    // Add this field to your errand schema
    matchedProviders: [
      {
        providerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        distance: Number,
        distanceText: String,
        duration: String,
        isNearby: {
          type: Boolean,
          default: false,
        },
        status: {
          type: String,
          enum: ["pending", "notified", "viewed", "offered", "declined"],
          default: "pending",
        },
        notifiedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    qrCode: {
      verificationToken: String,
      qrDataUrl: String,
      generatedAt: Date,
      expiresAt: Date,
      scannedAt: Date,
      scannedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      scanCount: {
        type: Number,
        default: 0,
      },
      isVerified: {
        type: Boolean,
        default: false,
      },
    },
    
    // Document/Pickup upload fields
    documents: [
      {
        type: {
          type: String,
          enum: ['receipt', 'pickup_document', 'image', 'other'],
          default: 'image',
        },
        url: String,
        filename: String,
        description: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        isRequired: {
          type: Boolean,
          default: false,
        },
      }
    ],
    
    // Pickup verification
    pickupVerification: {
      isVerified: {
        type: Boolean,
        default: false,
      },
      verifiedAt: Date,
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      verificationMethod: {
        type: String,
        enum: ['qr_code', 'manual', 'document'],
      },
      notes: String,
    },
    
    // Completion verification
    completionVerification: {
      isVerified: {
        type: Boolean,
        default: false,
      },
      verifiedAt: Date,
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      verificationMethod: {
        type: String,
        enum: ['qr_code', 'manual', 'document'],
      },
      proofImages: [String],
      notes: String,
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

errandSchema.pre("save", function (next) {
  // Only calculate if no provider assigned yet (base pricing)
  if (!this.providerId) {
    const distance = this.distance || 0;
    let ratePerMile = 0.8;

    if (distance <= 3) ratePerMile = 0.8;
    else if (distance <= 10) ratePerMile = 0.7;
    else if (distance <= 20) ratePerMile = 0.6;
    else ratePerMile = 0.5;

    this.distanceRate = ratePerMile;
    this.distanceFee = Math.round(distance * ratePerMile * 100) / 100;

    let subtotal = this.baseFee + this.distanceFee;
    if (this.isHeavyItem) subtotal += 2.99;
    if (this.waitTimeMinutes > 5) subtotal += (this.waitTimeMinutes - 5) * 0.3;
    if (this.isPeakUrgent) subtotal += 1.99;
    if (this.extraStopsCount > 0) subtotal += this.extraStopsCount * 1.5;

    this.subtotal = Math.round(subtotal * 100) / 100;

    // Apply subscription discount
    if (this.isSubscribed) {
      this.discountPercentage = 20;
      this.discountAmount = Math.round(this.subtotal * 0.2 * 100) / 100;
      this.total =
        Math.round((this.subtotal - this.discountAmount) * 100) / 100;
    } else {
      this.discountPercentage = 0;
      this.discountAmount = 0;
      this.total = this.subtotal;
    }

    // Platform fee and provider amount are calculated when offer is accepted
    // Leave them as 0 until provider is assigned
    this.platformFee = 0;
    this.providerAmount = 0;
  }

  next();
});

module.exports = mongoose.model("Errand", errandSchema);
