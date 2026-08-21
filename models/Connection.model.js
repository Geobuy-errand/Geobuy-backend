const mongoose = require('mongoose');

const connectionSchema = new mongoose.Schema(
  {
    connectionId: {
      type: String,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // ✅ Add this to track if user has paid the connection fee
    userHasPaidConnectionFee: {
      type: Boolean,
      default: false,
    },
    userPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
    },
    userPaymentDate: {
      type: Date,
    },
    fullName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
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
      address: {
        type: String,
        default: '',
      },
      town: {
        type: String,
        default: '',
      },
      postcode: {
        type: String,
        default: '',
      },
    },
    purpose: {
      type: String,
      required: true,
    },
    customPurpose: {
      type: String,
      maxlength: 200,
    },
    interests: [
      {
        type: String,
      },
    ],
    availability: {
      preferredDays: {
        type: [String],
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        default: [],
      },
      preferredTimeSlot: {
        type: String,
        enum: ['morning', 'afternoon', 'evening', 'anytime'],
        default: 'anytime',
      },
    },
    message: {
      type: String,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'completed', 'expired', 'cancelled'],
      default: 'pending',
    },
    fee: {
      amount: {
        type: Number,
        default: 1.99,
      },
      currency: {
        type: String,
        default: 'GBP',
      },
      paid: {
        type: Boolean,
        default: false,
      },
      paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment',
      },
      paidAt: Date,
    },
    connectionDate: {
      type: Date,
    },
    connectionTime: {
      type: String,
    },
    meetingType: {
      type: String,
      enum: ['in_person', 'virtual', 'phone'],
      default: 'virtual',
    },
    notes: {
      type: String,
      maxlength: 500,
    },
    rating: {
      score: {
        type: Number,
        min: 1,
        max: 5,
      },
      feedback: {
        type: String,
        maxlength: 300,
      },
      ratedAt: Date,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    adminNotes: {
      type: String,
      maxlength: 500,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Generate connection ID before saving
connectionSchema.pre('save', function (next) {
  if (!this.connectionId) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    this.connectionId = `CON-${year}${month}${day}-${random}`;
  }
  next();
});

// Indexes
connectionSchema.index({ location: '2dsphere' });
connectionSchema.index({ userId: 1, createdAt: -1 });
connectionSchema.index({ status: 1 });
connectionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
connectionSchema.index({ userHasPaidConnectionFee: 1 });

module.exports = mongoose.model('Connection', connectionSchema);