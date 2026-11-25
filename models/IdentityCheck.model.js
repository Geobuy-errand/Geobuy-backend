const mongoose = require('mongoose');

// One automated identity check for a provider or errand runner.
//   NG: NIN lookup with Dojah (instant).  UK: ID document + selfie with Didit (hosted).
const identityCheckSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['provider', 'errand_runner'] },
    country: { type: String, enum: ['GB', 'NG'], required: true },
    vendor: { type: String, enum: ['dojah', 'didit', 'mock', 'manual'], required: true },
    status: {
      type: String,
      enum: ['awaiting_payment', 'awaiting_start', 'pending', 'in_review', 'approved', 'declined', 'error', 'cancelled'],
      default: 'awaiting_start',
      index: true,
    },

    // NG
    ninLast4: String, // only the last 4 digits are stored
    ninHash: String, // sha256 of the NIN, to spot one NIN used on several accounts

    // UK (Didit hosted session)
    sessionId: { type: String, index: true },
    sessionUrl: String,

    // Result
    result: {
      firstName: String,
      lastName: String,
      middleName: String,
      dateOfBirth: String,
      nameMatch: { type: String, enum: ['full', 'partial', 'none', 'n/a'] },
      dobMatch: { type: String, enum: ['match', 'mismatch', 'unknown', 'n/a'] },
      vendorStatus: String, // e.g. Didit "Approved", "Declined", "In Review"
      reason: String,
    },

    // Fee (Admin → Settings → Verification → Who pays)
    paidBy: { type: String, enum: ['platform', 'worker'], default: 'platform' },
    fee: { type: Number, default: 0 },
    currency: String,
    paymentStatus: { type: String, enum: ['not_required', 'pending', 'paid', 'failed'], default: 'not_required' },
    paymentReference: { type: String, index: true },
    paymentGateway: String,
    paidAt: Date,

    mock: { type: Boolean, default: false },
    completedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewNote: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('IdentityCheck', identityCheckSchema);
