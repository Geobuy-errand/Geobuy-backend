const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      // minlength: 8,
    },
    role: {
      type: String,
      enum: ["customer", "errand_runner", "provider", "admin"],
      default: "customer",
    },
    // Country the account operates in. Drives currency, payment gateway,
    // distance units and which errands/providers a user can see.
    country: {
      type: String,
      enum: ["GB", "NG"],
      default: "GB",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    address: {
      street: String,
      area: String, // e.g. Lekki Phase 1, Wuse 2
      town: String, // town / city
      lga: String, // Nigeria: Local Government Area
      state: String, // Nigeria: state (UK: county, optional)
      postcode: String, // required in UK, optional in Nigeria
    },
    // Customer specific fields
    accessNeeds: String,
    preferredContactTime: String,
    over18: Boolean,
    acceptedTerms: Boolean,
    acceptedPrivacy: Boolean,
    // Provider specific fields
    dateOfBirth: Date,
    documents: {
      passport: String,
      proofOfAddress: String,
      rightToWork: String,
      drivingLicence: String,
      vehicleRegistration: String,
      vehicleInsurance: String,
      // Nigeria
      ninSlip: String, // NIN slip / National ID card
      utilityBill: String, // proof of address
      // Providers (optional)
      certification: String,
      insurance: String,
    },
    nin: String, // National Identification Number (Nigeria)
    bankDetails: {
      bankName: String,
      sortCode: String, // UK only
      accountNumber: String,
      // Nigeria (Paystack)
      bankCode: String,
      accountName: String,
      isVerified: { type: Boolean, default: false },
      paystackRecipientCode: String,
    },
    renderCareServices: {
      type: Boolean,
      default: false,
    },
    dbsDocument: String,
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "not_submitted"],
      default: "not_submitted",
    },
    rejectionReason: String,
    verificationRequestedAt: Date,
    averageRating: {
      type: Number,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    serviceCategories: [
      {
        type: String,
        default: [],
      }
    ],
    serviceArea: {
      postcodes: [String],
      radius: Number, // in the country's unit (miles for UK, km for Nigeria)
    },
    travelType: {
      type: String,
      enum: ["walking", "cycling", "driving"],
      default: "driving",
    },
    dbsStatus: {
      type: String,
      enum: ["clear", "pending", "expired", "not_submitted"],
      default: "not_submitted",
    },
    dbsNumber: String,
    dbsExpiry: Date,
    insuranceStatus: {
      type: String,
      enum: ["active", "expired", "not_insured"],
      default: "not_insured",
    },
    insuranceProvider: String,
    insuranceExpiry: Date,
    certifications: [
      {
        name: String,
        number: String,
        issuedBy: String,
        issueDate: Date,
        expiryDate: Date,
        documentUrl: String,
        verified: {
          type: Boolean,
          default: false,
        },
      },
    ],
    verificationBadges: [
      {
        type: String,
        enum: ["id_checked", "dbs_checked", "certified", "insured"],
      },
    ],
    availabilitySchedule: [
      {
        day: {
          type: String,
          enum: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
          ],
        },
        startTime: String,
        endTime: String,
        isAvailable: {
          type: Boolean,
          default: true,
        },
      },
    ],
    savedLocations: [
      {
        name: String,
        address: String,
        street: String,
        town: String,
        postcode: String,
        coordinates: {
          lat: Number,
          lng: Number,
        },
        isDefault: {
          type: Boolean,
          default: false,
        },
      },
    ],
    serviceRates: {
      hourlyRate: Number,
      fixedRate: Number,
      rateType: {
        type: String,
        enum: ["hourly", "fixed", "negotiable"],
        default: "negotiable",
      },
    },
    serviceTerms: {
      cancellationPolicy: String,
      noticePeriod: Number, // hours
      travelFee: Number,
    },
    // Add these fields to the User schema
    subscription: {
      isSubscribed: {
        type: Boolean,
        default: false,
      },
      stripeCustomerId: String,
      paystackCustomerCode: String,
      gateway: { type: String, enum: ["stripe", "paystack"] },
      subscriptionId: String,
      subscriptionStatus: {
        type: String,
        enum: ["active", "inactive", "canceled", "past_due", "trialing", "incomplete"],
        default: "inactive",
      },
      subscriptionPlan: String,
      subscribedAt: Date,
      subscriptionExpiresAt: Date,
    },
    hasPaidConnectionFee: {
      type: Boolean,
      default: false,
    },
    connectionFeePaidAt: {
      type: Date,
    },
    connectionFeePaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ location: "2dsphere" });

// Never send password hashes or payout recipient codes to clients.
userSchema.set("toJSON", {
  transform(doc, ret) {
    delete ret.password;
    if (ret.bankDetails) delete ret.bankDetails.paystackRecipientCode;
    return ret;
  },
});

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isCustomer = function () {
  return this.role === "customer";
};

userSchema.methods.isProvider = function () {
  return this.role === "provider";
};

userSchema.methods.isErrandRunner = function () {
  return this.role === 'errand_runner';
};

// Check if user is admin
userSchema.methods.isAdmin = function () {
  return this.role === "admin";
};

module.exports = mongoose.model("User", userSchema);
