const Connection = require('../models/Connection.model');
const User = require('../models/User.model');
const Payment = require('../models/Payment.model');
const Settings = require('../models/Setting.model');
const createNotification = require('../utils/create-notification')

// ============================================================
// CHECK IF USER HAS PAID CONNECTION FEE
// ============================================================
exports.checkUserPaymentStatus = async (req, res) => {
  try {
    // Check if user has any paid connection
    const paidConnection = await Connection.findOne({
      userId: req.user._id,
      'fee.paid': true,
    });

    // Also check if user has the flag set
    const user = await User.findById(req.user._id);
    
    const hasPaid = paidConnection !== null || user?.hasPaidConnectionFee === true;

    res.json({
      hasPaid,
      message: hasPaid ? 'User has already paid the connection fee' : 'User has not paid the connection fee',
    });
  } catch (error) {
    console.error('❌ Check payment status error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// PAY CONNECTION FEE (One-time payment for the user)
// ============================================================
exports.payConnectionFee = async (req, res) => {
    try {
      const { paymentMethod } = req.body;
  
      // Check if user already paid
      const existingPayment = await Connection.findOne({
        userId: req.user._id,
        'fee.paid': true,
      });
  
      if (existingPayment) {
        return res.status(400).json({
          message: 'You have already paid the connection fee. You can create unlimited connections.',
          alreadyPaid: true,
        });
      }
  
      // Get settings for fee
      const settings = await Settings.getSettings();
      const CONNECTION_FEE = settings.pricing?.connectionFee || 1.99;
      const PLATFORM_FEE_PERCENTAGE = settings.pricing?.platformFeePercentage || 20;
  
      // Calculate platform fee and provider amount
      const platformFeeAmount = CONNECTION_FEE * (PLATFORM_FEE_PERCENTAGE / 100);
      const providerAmount = CONNECTION_FEE - platformFeeAmount;
  
      // ✅ Create payment record with valid status
      const payment = new Payment({
        userId: req.user._id,
        customerId: req.user._id,
        providerId: req.user._id,
        amount: CONNECTION_FEE,
        providerAmount: providerAmount,
        platformFee: platformFeeAmount,
        currency: 'GBP',
        type: 'connection_fee',
        status: 'succeeded', // ✅ Use 'succeeded' instead of 'completed'
        paymentMethod: paymentMethod || 'stripe',
        metadata: {
          purpose: 'connection_fee',
          description: 'One-time fee for connections feature',
        },
        paymentDate: new Date(),
      });
      await payment.save();
  
      // Create a virtual connection to track payment
      const connection = new Connection({
        userId: req.user._id,
        fullName: req.user.fullName,
        email: req.user.email,
        phoneNumber: req.user.phoneNumber,
        location: {
          type: 'Point',
          coordinates: [0, 0],
          address: '',
          town: '',
          postcode: '',
        },
        purpose: 'payment_only',
        status: 'completed',
        fee: {
          amount: CONNECTION_FEE,
          currency: 'GBP',
          paid: true,
          paymentId: payment._id,
          paidAt: new Date(),
        },
        userHasPaidConnectionFee: true,
        userPaymentId: payment._id,
        userPaymentDate: new Date(),
        isActive: false,
        expiresAt: new Date(),
      });
      await connection.save();
  
      // Update user record
      await User.findByIdAndUpdate(req.user._id, {
        hasPaidConnectionFee: true,
        connectionFeePaidAt: new Date(),
        connectionFeePaymentId: payment._id,
      });
  
      // Send notification
      await createNotification(
        req.user._id,
        'connection_fee_paid',
        '✅ Connection Fee Paid',
        `You have successfully paid the one-time connection fee of £${CONNECTION_FEE}. You can now create unlimited connections.`,
        {
          paymentId: payment._id,
          amount: CONNECTION_FEE,
        }
      );
  
      res.json({
        message: 'Connection fee paid successfully',
        data: {
          payment,
          amount: CONNECTION_FEE,
          platformFee: platformFeeAmount,
          providerAmount: providerAmount,
          canCreateConnections: true,
        },
      });
  
    } catch (error) {
      console.error('❌ Pay connection fee error:', error);
      res.status(500).json({ message: error.message });
    }
  };

// ============================================================
// CREATE CONNECTION (Only if user has paid the fee)
// ============================================================
exports.createConnection = async (req, res) => {
    try {
      const {
        fullName,
        email,
        phoneNumber,
        location,
        purpose,
        customPurpose,
        interests,
        availability,
        message,
        meetingType,
        connectionDate,
        connectionTime,
      } = req.body;
  
      // Check if user has paid the connection fee
      const user = await User.findById(req.user._id);
      const hasPaid = user?.hasPaidConnectionFee === true;
  
      if (!hasPaid) {
        // Check for pending payment
        const pendingPayment = await Payment.findOne({
          customerId: req.user._id,
          type: 'connection_fee',
          status: { $in: ['pending', 'processing'] },
        });
  
        if (pendingPayment) {
          return res.status(402).json({
            message: 'Payment is pending. Please complete your payment.',
            requiresPayment: true,
            paymentId: pendingPayment._id,
            paymentIntentId: pendingPayment.paymentIntentId,
            fee: pendingPayment.amount,
          });
        }
  
        const settings = await Settings.getSettings();
        const CONNECTION_FEE = settings.pricing?.connectionFee || 1.99;
  
        return res.status(402).json({
          message: `Please pay the one-time connection fee of £${CONNECTION_FEE} to create connections.`,
          requiresPayment: true,
          fee: CONNECTION_FEE,
        });
      }
  
      // Validate purpose
      if (purpose === 'other' && !customPurpose) {
        return res.status(400).json({
          message: 'Please specify your purpose when selecting "Other"',
        });
      }
  
      // Check if user already has an active connection
      const existingConnection = await Connection.findOne({
        userId: req.user._id,
        status: { $in: ['pending', 'active'] },
      });
  
      if (existingConnection) {
        return res.status(400).json({
          message: 'You already have an active connection request. Please complete or cancel it first.',
          existingConnection: existingConnection,
        });
      }
  
      // Format location as GeoJSON
      const locationData = {
        type: 'Point',
        coordinates: [
          location?.coordinates?.lng || 0,
          location?.coordinates?.lat || 0,
        ],
        address: location?.address || '',
        town: location?.town || '',
        postcode: location?.postcode || '',
      };
  
      // Create connection
      const connection = new Connection({
        userId: req.user._id,
        fullName: fullName || req.user.fullName,
        email: email || req.user.email,
        phoneNumber: phoneNumber || req.user.phoneNumber,
        location: locationData,
        purpose,
        customPurpose: purpose === 'other' ? customPurpose : undefined,
        interests: interests || [],
        availability: availability || {},
        message: message || '',
        meetingType: meetingType || 'virtual',
        connectionDate,
        connectionTime,
        fee: {
          amount: 0,
          currency: 'GBP',
          paid: true,
        },
        userHasPaidConnectionFee: true,
        status: 'pending',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
  
      await connection.save();
  
      // Send notification to user
      await createNotification(
        req.user._id,
        'connection_created',
        '🔗 Connection Request Created',
        `Your connection request (${connection.connectionId}) has been created successfully.`,
        {
          connectionId: connection._id,
          connectionNumber: connection.connectionId,
        }
      );
  
      // Send notification to admins
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await createNotification(
          admin._id,
          'new_connection',
          '🔗 New Connection Request',
          `${req.user.fullName} has created a new connection request (${connection.connectionId})`,
          {
            connectionId: connection._id,
            userId: req.user._id,
            userName: req.user.fullName,
          }
        );
      }
  
      res.status(201).json({
        message: 'Connection created successfully',
        data: {
          connection,
          feePaid: true,
        },
      });
  
    } catch (error) {
      console.error('❌ Create connection error:', error);
      res.status(500).json({ message: error.message });
    }
  };

// ============================================================
// GET CONNECTION BY ID WITH DETAILS
// ============================================================
exports.getConnectionById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const connection = await Connection.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found' });
    }

    res.json({ data: connection });

  } catch (error) {
    console.error('❌ Get connection error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET USER CONNECTIONS
// ============================================================
exports.getMyConnections = async (req, res) => {
  try {
    const { status, limit = 20, page = 1 } = req.query;
    
    const query = { 
      userId: req.user._id,
      purpose: { $ne: 'payment_only' }, // Exclude payment-only records
    };
    if (status) {
      query.status = status;
    }

    const connections = await Connection.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Connection.countDocuments(query);

    // Get user payment status
    const user = await User.findById(req.user._id);
    const hasPaid = user?.hasPaidConnectionFee === true;

    res.json({
      data: connections,
      hasPaidConnectionFee: hasPaid,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });

  } catch (error) {
    console.error('❌ Get connections error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// UPDATE CONNECTION
// ============================================================
exports.updateConnection = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const connection = await Connection.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found' });
    }

    // Only allow updates if not completed/cancelled
    if (['completed', 'cancelled'].includes(connection.status)) {
      return res.status(400).json({ message: 'Cannot update a completed or cancelled connection' });
    }

    // Allowed updates
    const allowedUpdates = [
      'fullName',
      'email',
      'phoneNumber',
      'location',
      'purpose',
      'customPurpose',
      'interests',
      'availability',
      'message',
      'meetingType',
      'connectionDate',
      'connectionTime',
    ];

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        connection[key] = updates[key];
      }
    }

    await connection.save();

    res.json({
      message: 'Connection updated successfully',
      data: connection,
    });

  } catch (error) {
    console.error('❌ Update connection error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// CANCEL CONNECTION
// ============================================================
exports.cancelConnection = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const connection = await Connection.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found' });
    }

    if (['completed', 'cancelled'].includes(connection.status)) {
      return res.status(400).json({ message: 'Connection is already completed or cancelled' });
    }

    connection.status = 'cancelled';
    connection.notes = reason || 'Cancelled by user';
    connection.isActive = false;
    await connection.save();

    await createNotification(
      req.user._id,
      'connection_cancelled',
      '❌ Connection Cancelled',
      `Your connection request (${connection.connectionId}) has been cancelled.`,
      {
        connectionId: connection._id,
        connectionNumber: connection.connectionId,
        reason: reason || 'No reason provided',
      }
    );

    res.json({
      message: 'Connection cancelled successfully',
      data: connection,
    });

  } catch (error) {
    console.error('❌ Cancel connection error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// RATE CONNECTION
// ============================================================
exports.rateConnection = async (req, res) => {
  try {
    const { id } = req.params;
    const { score, feedback } = req.body;

    if (!score || score < 1 || score > 5) {
      return res.status(400).json({ message: 'Please provide a rating between 1 and 5' });
    }

    const connection = await Connection.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found' });
    }

    if (connection.status !== 'completed') {
      return res.status(400).json({ message: 'Only completed connections can be rated' });
    }

    if (connection.rating && connection.rating.score) {
      return res.status(400).json({ message: 'Connection already rated' });
    }

    connection.rating = {
      score,
      feedback: feedback || '',
      ratedAt: new Date(),
    };
    await connection.save();

    res.json({
      message: 'Connection rated successfully',
      data: connection,
    });

  } catch (error) {
    console.error('❌ Rate connection error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// ADMIN: GET ALL CONNECTIONS
// ============================================================
exports.adminGetAllConnections = async (req, res) => {
  try {
    const { status, purpose, limit = 20, page = 1, search } = req.query;
    
    const query = {
      purpose: { $ne: 'payment_only' },
    };
    if (status) query.status = status;
    if (purpose) query.purpose = purpose;
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { connectionId: { $regex: search, $options: 'i' } },
      ];
    }

    const connections = await Connection.find(query)
      .populate('userId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Connection.countDocuments(query);

    // Get stats
    const stats = {
      total: await Connection.countDocuments({ purpose: { $ne: 'payment_only' } }),
      pending: await Connection.countDocuments({ status: 'pending', purpose: { $ne: 'payment_only' } }),
      active: await Connection.countDocuments({ status: 'active', purpose: { $ne: 'payment_only' } }),
      completed: await Connection.countDocuments({ status: 'completed', purpose: { $ne: 'payment_only' } }),
      cancelled: await Connection.countDocuments({ status: 'cancelled', purpose: { $ne: 'payment_only' } }),
      totalRevenue: await Connection.aggregate([
        { $match: { 'fee.paid': true } },
        { $group: { _id: null, total: { $sum: '$fee.amount' } } },
      ]),
      usersWithPaidFee: await User.countDocuments({ hasPaidConnectionFee: true }),
    };

    res.json({
      data: connections,
      stats,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });

  } catch (error) {
    console.error('❌ Admin get connections error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// ADMIN: UPDATE CONNECTION STATUS
// ============================================================
exports.adminUpdateConnection = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes, meetingType, connectionDate, connectionTime } = req.body;

    const connection = await Connection.findById(id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found' });
    }

    if (status) {
      connection.status = status;
      
      if (status === 'completed') {
        connection.connectionDate = connectionDate || new Date();
      }
    }
    
    if (adminNotes) connection.adminNotes = adminNotes;
    if (meetingType) connection.meetingType = meetingType;
    if (connectionDate) connection.connectionDate = connectionDate;
    if (connectionTime) connection.connectionTime = connectionTime;

    await connection.save();

    await createNotification(
      connection.userId,
      'connection_status_updated',
      `📋 Connection Status: ${status}`,
      `Your connection request (${connection.connectionId}) status has been updated to ${status}`,
      {
        connectionId: connection._id,
        connectionNumber: connection.connectionId,
        status: status,
      }
    );

    res.json({
      message: 'Connection updated successfully',
      data: connection,
    });

  } catch (error) {
    console.error('❌ Admin update connection error:', error);
    res.status(500).json({ message: error.message });
  }
};