const express = require('express');
const router = express.Router();
const User = require('../models/User.model');
const ProviderProfile = require('../models/ProviderProfile.model');
const Booking = require('../models/Booking.model');
const Payment = require('../models/Payment.model');
const Review = require('../models/Review.model');
const Notification = require('../models/Notification.model');
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const { validate, userValidationRules } = require('../middleware/validation');

router.post('/login', validate(userValidationRules.login), async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if(user.role !== 'admin'){
      return res.status(401).json({message: 'Forbidden'})
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }


    // Check if provider is verified
    if (user.role === 'provider' && user.verificationStatus !== 'approved') {
      return res.status(403).json({
        message: 'Your account is not verified yet. Please wait for admin approval.',
        verificationStatus: user.verificationStatus,
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        verificationStatus: user.verificationStatus,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// Dashboard stats
router.get('/dashboard/stats', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const [
      totalUsers,
      totalProviders,
      totalBookings,
      pendingBookings,
      completedBookings,
      totalRevenue,
      pendingProviders,
    ] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'provider' }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: 'pending' }),
      Booking.countDocuments({ status: 'completed' }),
      Payment.aggregate([
        { $match: { status: 'succeeded' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      User.countDocuments({ role: 'provider', verificationStatus: 'pending' }),
    ]);

    // Recent bookings
    const recentBookings = await Booking.find()
      .populate('customerId', 'fullName email')
      .populate('providerId', 'fullName email')
      .populate('serviceId', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    // User growth (last 7 days)
    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      totalUsers,
      totalProviders,
      totalBookings,
      pendingBookings,
      completedBookings,
      totalRevenue: totalRevenue[0]?.total || 0,
      pendingProviders,
      recentBookings,
      userGrowth,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all users (admin)
router.get('/users', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
  ]const { role, status, search } = req.query;
  const query = {};
  
  // 1. Set the default rule: Exclude admins
  query.role = { $ne: 'admin' };
  
  // 2. Only narrow down by role if it's explicitly 'customer' or 'provider'
  if (role && role !== 'admin') {
    query.role = role;
  } 
  // If role === 'admin', the code falls through here, keeping query.role = { $ne: 'admin' }
  
  if (status === 'active') query.isActive = true;
  if (status === 'inactive') query.isActive = false;
  
  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }
  
  const users = await User.find(query)
    .select('-password')
    .sort({ createdAt: -1 });
  

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get pending providers (verification queue)
router.get('/verification-queue', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const providers = await User.find({
      role: 'provider',
      verificationStatus: 'pending',
    })
      .select('-password')
      .populate('providerProfile')
      .sort({ createdAt: 1 });

    res.json(providers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Verify provider
router.put('/verify-provider/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role !== 'provider') {
      return res.status(400).json({ message: 'User is not a provider' });
    }

    user.verificationStatus = status;
    if (status === 'rejected') {
      user.rejectionReason = rejectionReason || 'Verification failed';
    }
    await user.save();

    // Update provider profile
    const providerProfile = await ProviderProfile.findOne({ userId: user._id });
    if (providerProfile) {
      providerProfile.isVerified = status === 'approved';
      providerProfile.verificationReviewedAt = new Date();
      if (status === 'approved') {
        providerProfile.verificationNotes = 'Approved';
      } else {
        providerProfile.verificationNotes = rejectionReason || 'Rejected';
      }
      await providerProfile.save();
    }

    // Create notification
    const notification = new Notification({
      userId: user._id,
      type: status === 'approved' ? 'provider_verified' : 'provider_rejected',
      title: status === 'approved' ? 'Account Verified' : 'Verification Failed',
      message: status === 'approved'
        ? 'Your provider account has been verified. You can now accept bookings.'
        : `Your verification was rejected: ${rejectionReason || 'Please contact support'}`,
    });
    await notification.save();

    res.json({
      message: `Provider ${status} successfully`,
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Suspend/Activate user
router.put('/users/:id/toggle-status', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      message: `User ${user.isActive ? 'activated' : 'suspended'} successfully`,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all bookings (admin)
router.get('/bookings', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    const query = {};

    if (status) query.status = status;
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const bookings = await Booking.find(query)
      .populate('customerId', 'fullName email')
      .populate('providerId', 'fullName email')
      .populate('serviceId', 'name')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all payments (admin)
router.get('/payments', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate('customerId', 'fullName email')
      .populate('providerId', 'fullName email')
      .populate('bookingId', 'bookingId serviceType')
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all reviews (admin)
router.get('/reviews', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate('reviewerId', 'fullName email')
      .populate('revieweeId', 'fullName email')
      .populate('bookingId', 'bookingId')
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete review (admin)
router.delete('/reviews/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    await review.deleteOne();
    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Analytics - Revenue over time
router.get('/analytics/revenue', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { period } = req.query; // day, week, month, year

    let groupFormat;
    switch (period) {
      case 'day':
        groupFormat = '%Y-%m-%d';
        break;
      case 'week':
        groupFormat = '%Y-%U';
        break;
      case 'month':
        groupFormat = '%Y-%m';
        break;
      case 'year':
        groupFormat = '%Y';
        break;
      default:
        groupFormat = '%Y-%m-%d';
    }

    const revenue = await Payment.aggregate([
      { $match: { status: 'succeeded' } },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          platformFee: { $sum: '$platformFee' },
          providerAmount: { $sum: '$providerAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(revenue);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Analytics - Booking stats
router.get('/analytics/bookings', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const stats = await Booking.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const total = await Booking.countDocuments();
    const avgPrice = await Booking.aggregate([
      {
        $group: {
          _id: null,
          avg: { $avg: '$estimatedPrice' },
        },
      },
    ]);

    res.json({
      byStatus: stats,
      total,
      averagePrice: avgPrice[0]?.avg || 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;