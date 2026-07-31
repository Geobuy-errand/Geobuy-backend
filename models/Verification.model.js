const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'identity',
        'dbs',
        'certification',
        'insurance',
        'address',
        'right_to_work',
      ],
      required: true,
    },
    documentUrl: {
      type: String,
      required: true,
    },
    documentNumber: String,
    expiryDate: Date,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'expired'],
      default: 'pending',
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedAt: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectionReason: String,
    notes: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Verification', verificationSchema);