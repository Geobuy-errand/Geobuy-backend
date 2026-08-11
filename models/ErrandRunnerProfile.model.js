const mongoose = require('mongoose');

const errandRunnerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    // Personal Details
    dateOfBirth: Date,
    phoneNumber: String,
    address: {
      street: String,
      town: String,
      postcode: String,
    },
    
    // Vehicle & Transport
    vehicleType: {
      type: String,
      enum: ['car', 'van', 'bicycle', 'motorbike', 'walking'],
      default: 'walking',
    },
    vehicleRegistration: String,
    vehicleInsurance: {
      provider: String,
      policyNumber: String,
      expiryDate: Date,
    },
    drivingLicence: String,
    
    // Work Preferences
    maxWeightCapacity: {
      type: Number,
      default: 10, // in kg
    },
    maxDistancePreference: {
      type: Number,
      default: 10, // in miles
    },
    preferredAreas: [String],
    availableDays: {
      monday: { type: Boolean, default: true },
      tuesday: { type: Boolean, default: true },
      wednesday: { type: Boolean, default: true },
      thursday: { type: Boolean, default: true },
      friday: { type: Boolean, default: true },
      saturday: { type: Boolean, default: false },
      sunday: { type: Boolean, default: false },
    },
    availableHours: {
      start: { type: String, default: '08:00' },
      end: { type: String, default: '18:00' },
    },
    
    // Documents
    documents: {
      passport: String,
      drivingLicence: String,
      proofOfAddress: String,
      rightToWork: String,
      vehicleRegistration: String,
      vehicleInsurance: String,
    },
    
    // Verification
    verificationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'not_submitted'],
      default: 'not_submitted',
    },
    verificationSubmittedAt: Date,
    verificationReviewedAt: Date,
    verificationNotes: String,
    rejectionReason: String,
    
    // DBS (if required for care services)
    dbsChecked: {
      type: Boolean,
      default: false,
    },
    dbsNumber: String,
    dbsExpiry: Date,
    dbsDocument: String,
    
    // Stats
    completedJobs: {
      type: Number,
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    averageRating: {
      type: Number,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    responseTime: {
      type: Number,
      default: 0,
    },
    completionRate: {
      type: Number,
      default: 0,
    },
    acceptanceRate: {
      type: Number,
      default: 0,
    },
    
    // Bank Details (for payouts)
    bankDetails: {
      bankName: String,
      sortCode: String,
      accountNumber: String,
    },
    
    // About
    about: String,
    languages: [String],
    skills: [String],
    
    // Location
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
      lastUpdated: Date,
    },
    
    // Stripe Connect Account
    stripeAccountId: String,
    stripeAccountStatus: {
      type: String,
      enum: ['pending', 'active', 'disabled'],
      default: 'pending',
    },
    
    isActive: {
      type: Boolean,
      default: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for geospatial queries
errandRunnerProfileSchema.index({ location: '2dsphere' });
errandRunnerProfileSchema.index({ userId: 1 });

module.exports = mongoose.model('ErrandRunnerProfile', errandRunnerProfileSchema);