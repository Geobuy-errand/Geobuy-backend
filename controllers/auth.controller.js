const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const ProviderProfile = require('../models/ProviderProfile.model');
const Wallet = require('../models/Wallet.model');
const ErrandRunnerProfileModel = require('../models/ErrandRunnerProfile.model');

// Register Customer
exports.registerCustomer = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phoneNumber,
      password,
      address,
      accessNeeds,
      preferredContactTime,
      over18,
      acceptedTerms,
      acceptedPrivacy,
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = new User({
      fullName,
      email,
      phoneNumber,
      password,
      address,
      accessNeeds,
      preferredContactTime,
      over18,
      acceptedTerms,
      acceptedPrivacy,
      role: 'customer',
      isVerified: true,
    });

    await user.save();

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

    res.status(201).json({
      message: 'Customer registered successfully',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Register Provider
exports.registerProvider = async (req, res) => {
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

    console.log('📝 Registering provider:', email);

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Validate required fields
    if (!fullName || !email || !phoneNumber || !password) {
      return res.status(400).json({ message: 'Please fill in all required fields' });
    }

    if (!over18) {
      return res.status(400).json({ message: 'You must be over 18 to register' });
    }

    if (!acceptedTerms || !acceptedPrivacy || !informationTrue) {
      return res.status(400).json({ message: 'Please accept all terms and conditions' });
    }

    // Create user
    const user = new User({
      fullName,
      email,
      phoneNumber,
      password,
      role: 'provider',
      dateOfBirth: new Date(dateOfBirth),
      address: {
        street: address.street,
        town: address.town,
        postcode: address.postcode,
      },
      bankDetails: {
        bankName: bankDetails.bankName,
        sortCode: bankDetails.sortCode,
        accountNumber: bankDetails.accountNumber,
      },
      renderCareServices: renderCareServices || false,
      over18,
      acceptedTerms,
      acceptedPrivacy,
      informationTrue,
      verificationStatus: 'pending',
      isActive: true,
      isVerified: false,
      // Initialize with empty serviceCategories - they can add later in profile
      serviceCategories: [],
      location: {
        type: 'Point',
        coordinates: [0, 0], // Will be updated with geocoding
      },
    });

    await user.save();

    // Create provider profile
    const providerProfile = new ProviderProfile({
      userId: user._id,
      serviceCategories: [],
      verificationStatus: 'pending',
      isVerified: false,
      about: '',
      completedJobs: 0,
      totalEarnings: 0,
      completionRate: 0,
    });

    await providerProfile.save();

    // Create wallet
    const Wallet = require('../models/Wallet.model');
    const wallet = new Wallet({
      userId: user._id,
      balance: 0,
      totalEarned: 0,
    });

    await wallet.save();

    // Generate JWT
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    console.log('✅ Provider registered successfully:', email);

    res.status(201).json({
      message: 'Provider registered successfully',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        serviceCategories: user.serviceCategories || [],
        verificationStatus: user.verificationStatus,
        isActive: user.isActive,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error('❌ Register provider error:', error);
    res.status(500).json({ message: error.message });
  }
};

//Register errand runner
exports.registerErrandRunner = async (req, res) => {
  try {
    const {
      fullName,
      dateOfBirth,
      email,
      phoneNumber,
      password,
      address,
      bankDetails,
      vehicleType,
      vehicleRegistration,
      vehicleInsurance,
      drivingLicence,
      maxWeightCapacity,
      maxDistancePreference,
      preferredAreas,
      availableDays,
      availableHours,
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
      role: 'errand_runner',
      verificationStatus: 'pending',
    });

    await user.save();

    // Create errand runner profile
    const errandRunnerProfile = new ErrandRunnerProfileModel({
      userId: user._id,
      dateOfBirth,
      phoneNumber,
      address,
      bankDetails,
      vehicleType: vehicleType || 'walking',
      vehicleRegistration,
      vehicleInsurance,
      drivingLicence,
      maxWeightCapacity: maxWeightCapacity || 10,
      maxDistancePreference: maxDistancePreference || 10,
      preferredAreas: preferredAreas || [address.town],
      availableDays: availableDays || {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
      },
      availableHours: availableHours || { start: '08:00', end: '18:00' },
      verificationStatus: 'pending',
      verificationSubmittedAt: new Date(),
      location: {
        type: 'Point',
        coordinates: [0, 0],
      },
    });

    await errandRunnerProfile.save();

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

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      message: 'Errand runner registered successfully. Awaiting verification.',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        verificationStatus: user.verificationStatus,
      },
      errandRunnerProfile,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Login
exports.login = async (req, res) => {
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

// Logout
exports.logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.json({ message: 'Logged out successfully' });
};

// Get current user
exports.getCurrentUser = async (req, res) => {
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
};