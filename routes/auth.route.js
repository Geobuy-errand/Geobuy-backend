const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const ProviderProfile = require('../models/ProviderProfile.model');
const Wallet = require('../models/wallet.model');
const { validate, userValidationRules } = require('../middleware/validation');
const { authMiddleware } = require('../middleware/auth.middleware');
const AuthController = require('../controllers/auth.controller');

// Register Customer
router.post(
  '/register/customer',
  validate(userValidationRules.registerCustomer),
  AuthController.registerCustomer
);

// Register Provider
router.post(
  '/register/provider',
  validate(userValidationRules.registerProvider),
  async (req, res) => {
    try {
      const {
        fullName,
        dateOfBirth,
        email,
        phoneNumber,
        password,
        address,
        bankDetails,
        renderCareServices,
        over18,
        acceptedTerms,
        acceptedPrivacy,
        informationTrue,
      } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already registered' });
      }

      const user = new User({
        fullName,
        dateOfBirth,
        email,
        phoneNumber,
        password,
        address,
        bankDetails,
        renderCareServices,
        over18,
        acceptedTerms,
        acceptedPrivacy,
        role: 'provider',
        verificationStatus: 'pending',
      });

      await user.save();

      // Create provider profile
      const providerProfile = new ProviderProfile({
        userId: user._id,
        serviceAreas: [address.town],
        verificationSubmittedAt: new Date(),
      });

      await providerProfile.save();

      // Create wallet
      const wallet = new Wallet({
        userId: user._id,
      });

      await wallet.save();

      // Generate JWT
      const token = jwt.sign(
        { userId: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
      );

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        message: 'Provider registered successfully. Awaiting verification.',
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          verificationStatus: user.verificationStatus,
        },
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Login
router.post('/login', validate(userValidationRules.login), async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
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

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
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

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.json({ message: 'Logged out successfully' });
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    let providerProfile = null;
    if (user.role === 'provider') {
      providerProfile = await ProviderProfile.findOne({ userId: user._id });
    }

    res.json({
      user,
      providerProfile,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;