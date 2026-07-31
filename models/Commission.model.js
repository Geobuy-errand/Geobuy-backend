const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema(
  {
    invoiceId: {
      type: String,
      unique: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },
    serviceRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceRequest',
    },
    errandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Errand',
    },
    amount: {
      type: Number,
      required: true,
    },
    commissionRate: {
      type: Number,
      default: 10, // percentage
    },
    commissionAmount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'cancelled'],
      default: 'pending',
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paidAt: Date,
    paymentMethod: String,
    invoiceUrl: String,
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Generate invoice ID before saving
commissionSchema.pre('save', function (next) {
  if (!this.invoiceId) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    this.invoiceId = `INV-${year}${month}${day}-${random}`;
  }
  next();
});

module.exports = mongoose.model('Commission', commissionSchema);