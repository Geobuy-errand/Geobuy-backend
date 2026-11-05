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
    // Country / currency the errand is priced and paid in
    country: {
      type: String,
      enum: ["GB", "NG"],
      default: "GB",
      index: true,
    },
    currency: {
      type: String,
      enum: ["GBP", "NGN"],
      default: "GBP",
    },
    distanceUnit: {
      type: String,
      enum: ["mi", "km"],
      default: "mi",
    },
    serviceType: {
      type: String,
      // enum: [
      //   "parcel_delivery",
      //   "document_delivery",
      //   "prescription_pickup",
      //   "dry_cleaning_pickup",
      //   "queue_waiting",
      //   "shopping",
      //   "groceries",
      //   "pharmacy",
      //   "food_pickup",
      //   "custom",
      // ],
      // required: true,
    },
    pickup: {
      address: String,
      formattedAddress: String,
      street: String,
      area: String,
      town: String,
      lga: String,
      state: String,
      postcode: String,
      contactName: String,
      contactPhone: String,
      coordinates: {
        lat: Number,
        lng: Number,
      },
      instructions: String,
    },
    dropoff: {
      address: String,
      formattedAddress: String,
      street: String,
      area: String,
      town: String,
      lga: String,
      state: String,
      postcode: String,
      contactName: String,
      contactPhone: String,
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
        "completed"
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
    completedAt: Date,
    completedBy: String, // customer | admin | system (auto-complete)
    paidAt: Date,
    cancelledAt: Date,
    cancellationReason: String,
    cancelledBy: String,
    requiresLiveTracking: {
      type: Boolean,
      default: false,
    },
    // Distance in the country's display unit (miles for GB, km for NG)
    distance: {
      type: Number,
      default: 0,
    },
    distanceKm: {
      type: Number,
      default: 0,
    },
    distanceSource: String, // google | osrm | estimate
    distanceText: {
      type: String,
      default: "",
    },
    baseFee: {
      type: Number,
      default: 0,
    },
    subtotal: {
      type: Number,
      default: 0,
    },
    discountPercentage: {
      type: Number,
      default: 0,
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
      default: 0, // effective rate per mile (GB) / per km (NG)
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
      enum: ["pending", "paid", "released", "refunded", "refund_pending"],
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
      default: 0,
    },
    providerAmount: {
      type: Number,
      default: 0,
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

// NOTE: Pricing is calculated in services/pricingService.js and set by the
// controller. The old pre-save pricing hooks were removed because they
// re-ran on every save (e.g. status updates) and silently overwrote the
// price the customer had already paid.

// Generate errand ID before saving
errandSchema.pre("save", function (next) {
  if (!this.errandId) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    // 6 random alphanumerics: ~2 billion combinations per day (the old
    // 4-digit suffix collided after a few dozen errands a day).
    const random = require("crypto").randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
    this.errandId = `E-${year}${month}${day}-${random}`;
  }
  next();
});

errandSchema.index({ status: 1, paymentStatus: 1, country: 1, providerId: 1 });
errandSchema.index({ customerId: 1, createdAt: -1 });

module.exports = mongoose.model("Errand", errandSchema);
