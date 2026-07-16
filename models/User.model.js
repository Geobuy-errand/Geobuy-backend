const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
      enum: ['customer', 'provider', 'admin'],
      default: 'customer',
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
      town: String,
      postcode: String,
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
    },
    bankDetails: {
      bankName: String,
      sortCode: String,
      accountNumber: String,
    },
    renderCareServices: {
      type: Boolean,
      default: false,
    },
    dbsDocument: String,
    verificationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    rejectionReason: String,
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
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ location: '2dsphere' });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isCustomer = function () {
  return this.role === 'customer';
};


userSchema.methods.isProvider = function () {
  return this.role === 'provider';
};

// Check if user is admin
userSchema.methods.isAdmin = function () {
  return this.role === 'admin';
};

module.exports = mongoose.model('User', userSchema);