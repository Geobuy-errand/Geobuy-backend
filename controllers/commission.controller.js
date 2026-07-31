const Commission = require('../models/Commission.model');
const Booking = require('../models/Booking.model');
const Errand = require('../models/Errand.model');
const ServiceRequest = require('../models/ServiceRequest.model');
const User = require('../models/User.model');
const Quote = require('../models/Quote.model');

// Get all commissions for a provider
exports.getMyCommissions = async (req, res) => {
  try {
    const commissions = await Commission.find({ providerId: req.user._id })
      .populate('bookingId', 'bookingId serviceType status')
      .populate('serviceRequestId', 'requestId serviceType status')
      .populate('errandId', 'errandId serviceType status')
      .sort({ createdAt: -1 });

    res.json(commissions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get commission by ID
exports.getCommissionById = async (req, res) => {
  try {
    const commission = await Commission.findById(req.params.id)
      .populate('providerId', 'fullName email phoneNumber')
      .populate('bookingId', 'bookingId serviceType status estimatedPrice')
      .populate('serviceRequestId', 'requestId serviceType status')
      .populate('errandId', 'errandId serviceType status');

    if (!commission) {
      return res.status(404).json({ message: 'Commission not found' });
    }

    // Check authorization
    if (commission.providerId._id.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(commission);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Generate commission invoice (admin only)
exports.generateCommission = async (req, res) => {
  try {
    const { 
      providerId, 
      bookingId, 
      serviceRequestId, 
      errandId,
      amount,
      commissionRate,
      dueDate,
      notes 
    } = req.body;

    // Validate at least one booking reference
    if (!bookingId && !serviceRequestId && !errandId) {
      return res.status(400).json({ 
        message: 'At least one booking reference is required' 
      });
    }

    // Validate provider exists
    const provider = await User.findById(providerId);
    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    if (provider.role !== 'provider') {
      return res.status(400).json({ message: 'User is not a provider' });
    }

    // Calculate commission
    const rate = commissionRate || 10; // Default 10%
    const commissionAmount = Math.round((amount * rate) / 100 * 100) / 100;

    const commission = new Commission({
      providerId,
      bookingId: bookingId || null,
      serviceRequestId: serviceRequestId || null,
      errandId: errandId || null,
      amount,
      commissionRate: rate,
      commissionAmount,
      dueDate: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
      status: 'pending',
      notes,
    });

    await commission.save();

    res.status(201).json({
      message: 'Commission invoice generated successfully',
      commission,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Auto-generate commission after booking completion
exports.autoGenerateCommission = async (req, res) => {
  try {
    const { bookingId, errandId, serviceRequestId } = req.body;

    let booking, providerId, amount, reference;

    // Find the booking and get provider info
    if (bookingId) {
      booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }
      providerId = booking.providerId;
      amount = booking.estimatedPrice || booking.finalPrice || 0;
      reference = { bookingId: booking._id };
    } else if (errandId) {
      const errand = await Errand.findById(errandId);
      if (!errand) {
        return res.status(404).json({ message: 'Errand not found' });
      }
      providerId = errand.providerId;
      amount = errand.estimatedPrice?.total || 0;
      reference = { errandId: errand._id };
    } else if (serviceRequestId) {
      const serviceRequest = await ServiceRequest.findById(serviceRequestId);
      if (!serviceRequest) {
        return res.status(404).json({ message: 'Service request not found' });
      }
      providerId = serviceRequest.selectedProviderId;
      const quote = await Quote.findOne({ serviceRequestId: serviceRequest._id, isSelected: true });
      amount = quote?.amount || 0;
      reference = { serviceRequestId: serviceRequest._id };
    } else {
      return res.status(400).json({ message: 'No valid reference provided' });
    }

    if (!providerId) {
      return res.status(400).json({ message: 'No provider associated with this booking' });
    }

    if (amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount for commission' });
    }

    // Check if commission already exists
    const existingCommission = await Commission.findOne({
      providerId,
      ...reference,
    });

    if (existingCommission) {
      return res.status(400).json({ message: 'Commission already generated for this booking' });
    }

    // Generate commission
    const rate = 10; // 10% platform fee
    const commissionAmount = Math.round((amount * rate) / 100 * 100) / 100;

    const commission = new Commission({
      providerId,
      bookingId: bookingId || null,
      serviceRequestId: serviceRequestId || null,
      errandId: errandId || null,
      amount,
      commissionRate: rate,
      commissionAmount,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'pending',
      notes: 'Auto-generated commission',
    });

    await commission.save();

    res.status(201).json({
      message: 'Commission auto-generated successfully',
      commission,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark commission as paid (admin only)
exports.markCommissionPaid = async (req, res) => {
  try {
    const { paymentMethod, notes } = req.body;
    const commission = await Commission.findById(req.params.id);

    if (!commission) {
      return res.status(404).json({ message: 'Commission not found' });
    }

    if (commission.status === 'paid') {
      return res.status(400).json({ message: 'Commission already paid' });
    }

    commission.status = 'paid';
    commission.paidAt = new Date();
    commission.paymentMethod = paymentMethod || 'bank_transfer';
    commission.notes = notes || commission.notes;

    await commission.save();

    res.json({
      message: 'Commission marked as paid',
      commission,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark commission as cancelled (admin only)
exports.cancelCommission = async (req, res) => {
  try {
    const { notes } = req.body;
    const commission = await Commission.findById(req.params.id);

    if (!commission) {
      return res.status(404).json({ message: 'Commission not found' });
    }

    if (commission.status === 'paid') {
      return res.status(400).json({ message: 'Cannot cancel a paid commission' });
    }

    commission.status = 'cancelled';
    commission.notes = notes || 'Cancelled by admin';

    await commission.save();

    res.json({
      message: 'Commission cancelled',
      commission,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get commission statistics for provider
exports.getCommissionStats = async (req, res) => {
  try {
    const stats = await Commission.aggregate([
      { $match: { providerId: req.user._id } },
      {
        $group: {
          _id: '$status',
          total: { $sum: '$commissionAmount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalPending = stats.find(s => s._id === 'pending')?.total || 0;
    const totalPaid = stats.find(s => s._id === 'paid')?.total || 0;
    const totalCancelled = stats.find(s => s._id === 'cancelled')?.total || 0;
    const countPending = stats.find(s => s._id === 'pending')?.count || 0;
    const countPaid = stats.find(s => s._id === 'paid')?.count || 0;
    const countCancelled = stats.find(s => s._id === 'cancelled')?.count || 0;

    res.json({
      totalPending,
      totalPaid,
      totalCancelled,
      countPending,
      countPaid,
      countCancelled,
      totalCommission: totalPending + totalPaid,
      totalCount: countPending + countPaid + countCancelled,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: Get all commissions with filters
exports.getAllCommissions = async (req, res) => {
  try {
    const { status, providerId, startDate, endDate } = req.query;
    const query = {};

    if (status) query.status = status;
    if (providerId) query.providerId = providerId;
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const commissions = await Commission.find(query)
      .populate('providerId', 'fullName email phoneNumber')
      .populate('bookingId', 'bookingId serviceType status')
      .populate('serviceRequestId', 'requestId serviceType status')
      .populate('errandId', 'errandId serviceType status')
      .sort({ createdAt: -1 });

    res.json(commissions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: Get commission summary
exports.getCommissionSummary = async (req, res) => {
  try {
    const summary = await Commission.aggregate([
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalCommission: { $sum: '$commissionAmount' },
          totalPending: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending'] }, '$commissionAmount', 0],
            },
          },
          totalPaid: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, '$commissionAmount', 0],
            },
          },
          countPending: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending'] }, 1, 0],
            },
          },
          countPaid: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, 1, 0],
            },
          },
          countCancelled: {
            $sum: {
              $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0],
            },
          },
        },
      },
    ]);

    res.json(summary[0] || {
      totalAmount: 0,
      totalCommission: 0,
      totalPending: 0,
      totalPaid: 0,
      countPending: 0,
      countPaid: 0,
      countCancelled: 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Generate invoice URL (simulate generating PDF)
exports.getInvoice = async (req, res) => {
  try {
    const commission = await Commission.findById(req.params.id)
      .populate('providerId', 'fullName email phoneNumber address bankDetails');

    if (!commission) {
      return res.status(404).json({ message: 'Commission not found' });
    }

    // Check authorization
    if (commission.providerId._id.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // In a real app, this would generate a PDF and return a URL
    // For now, we'll return the commission data as JSON
    res.json({
      invoiceId: commission.invoiceId,
      provider: {
        name: commission.providerId.fullName,
        email: commission.providerId.email,
        phone: commission.providerId.phoneNumber,
        address: commission.providerId.address,
        bankDetails: commission.providerId.bankDetails,
      },
      amount: commission.amount,
      commissionRate: commission.commissionRate,
      commissionAmount: commission.commissionAmount,
      dueDate: commission.dueDate,
      status: commission.status,
      createdAt: commission.createdAt,
      paidAt: commission.paidAt,
      notes: commission.notes,
      bookingId: commission.bookingId,
      serviceRequestId: commission.serviceRequestId,
      errandId: commission.errandId,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};