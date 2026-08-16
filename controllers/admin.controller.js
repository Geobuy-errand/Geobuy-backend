const User = require('../models/User.model');
const ProviderProfile = require('../models/ProviderProfile.model');
const Booking = require('../models/Booking.model');
const Payment = require('../models/Payment.model');
const Review = require('../models/Review.model');
const Notification = require('../models/Notification.model');
const jwt = require('jsonwebtoken');

// Admin Login
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if user is admin
    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden - Admin access required' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
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
};

// Dashboard stats
exports.getDashboardStats = async (req, res) => {
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
      User.countDocuments({ 'subscription.isSubscribed': true }),
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
};

// Get all users (admin)
// Get all users (admin) - with server-side pagination and verification filter
exports.getUsers = async (req, res) => {
  try {
    const { 
      role, 
      status, 
      search, 
      verificationStatus,
      page = 1, 
      limit = 10 
    } = req.query;
    
    // Parse pagination params
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;
    
    const query = {};
    
    // Set the default rule: Exclude admins unless explicitly asked
    if (role !== 'admin') {
      query.role = { $ne: 'admin' };
    }
    
    // Filter by specific role
    if (role && role !== 'admin' && role !== 'all') {
      query.role = role;
    }
    
    // Filter by active status
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;
    
    // ✅ Filter by verification status (for providers)
    if (verificationStatus) {
      query.verificationStatus = verificationStatus;
    }
    
    // Search by name or email
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
      ];
    }
    
    // Get total count for pagination
    const totalUsers = await User.countDocuments(query);
    
    // Get paginated users
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);
    
    // Calculate total pages
    const totalPages = Math.ceil(totalUsers / limitNumber);
    
    // ✅ Get stats for verification status (for providers)
    let stats = {};
    if (role === 'provider' || !role) {
      const verifiedCount = await User.countDocuments({ 
        ...query, 
        verificationStatus: 'approved' 
      });
      const pendingCount = await User.countDocuments({ 
        ...query, 
        verificationStatus: 'pending' 
      });
      const rejectedCount = await User.countDocuments({ 
        ...query, 
        verificationStatus: 'rejected' 
      });
      
      stats = {
        verified: verifiedCount,
        pending: pendingCount,
        rejected: rejectedCount,
      };
    }
    
    res.json({
      users,
      total: totalUsers,
      totalPages,
      currentPage: pageNumber,
      limit: limitNumber,
      stats,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get pending providers (verification queue)
exports.getVerificationQueue = async (req, res) => {
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
};

// Verify provider
exports.verifyProvider = async (req, res) => {
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
};

// Suspend/Activate user
exports.toggleUserStatus = async (req, res) => {
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
};

// Get all bookings (admin)
exports.getBookings = async (req, res) => {
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
};

// Get all payments (admin)
exports.getPayments = async (req, res) => {
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
};

// Get all reviews (admin)
exports.getReviews = async (req, res) => {
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
};

// Delete review (admin)
exports.deleteReview = async (req, res) => {
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
};

// Analytics - Revenue over time
exports.getRevenueAnalytics = async (req, res) => {
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
};

// Analytics - Booking stats
exports.getBookingAnalytics = async (req, res) => {
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
};