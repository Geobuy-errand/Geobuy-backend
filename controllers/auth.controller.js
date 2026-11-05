const jwt = require("jsonwebtoken");
const User = require("../models/User.model");
const ProviderProfile = require("../models/ProviderProfile.model");
const Wallet = require("../models/Wallet.model");
const ErrandRunnerProfileModel = require("../models/ErrandRunnerProfile.model");
const { sendTemplateEmail, authTemplates } = require("../utils/email-templates");
const { normalizeCountry, getCountry } = require("../config/countries");
const geoService = require("../services/geoService");

// ------------------------------------------------------------
// Helpers shared by all sign-up flows
// ------------------------------------------------------------
const COOKIE_OPTIONS = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

function signToken(user) {
  // Always `userId` — the auth middleware reads this field. (Provider
  // sign-up used to sign `id`, which logged new providers straight out.)
  return jwt.sign(
    { userId: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || "7d" }
  );
}

function cleanAddress(address = {}, country) {
  return {
    street: address.street,
    area: address.area,
    town: address.town || address.city,
    lga: address.lga,
    state: address.state,
    postcode: country === "GB" ? String(address.postcode || "").toUpperCase().trim() : address.postcode,
  };
}

function cleanBankDetails(bank = {}, country) {
  if (!bank) return undefined;
  if (country === "NG") {
    return {
      bankName: bank.bankName,
      bankCode: bank.bankCode,
      accountNumber: bank.accountNumber,
      accountName: bank.accountName,
      isVerified: false,
    };
  }
  return {
    bankName: bank.bankName,
    sortCode: String(bank.sortCode || "").replace(/[\s-]/g, ""),
    accountNumber: bank.accountNumber,
  };
}

/** Coordinates for the user's home address (used for distance matching). */
async function locationFor(address, country, coordinates) {
  try {
    const point = await geoService.resolvePoint({ ...address, coordinates }, country);
    if (point) return { type: "Point", coordinates: [point.lng, point.lat] };
  } catch (e) {
    console.warn("Address geocoding failed at sign-up:", e.message);
  }
  return { type: "Point", coordinates: [0, 0] };
}

async function sendWelcome(templateFn, email, fullName) {
  try {
    const t = templateFn(fullName, email);
    await sendTemplateEmail(email, t.subject, t.title, t.content, t.button);
  } catch (e) {
    console.warn("Welcome email failed:", e.message);
  }
}

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
      coordinates,
    } = req.body;
    const country = normalizeCountry(req.body.country);

    // Check if user already exists
    const existingUser = await User.findOne({ email: String(email).toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const cleanAddr = cleanAddress(address, country);
    const user = new User({
      fullName,
      email,
      phoneNumber,
      password,
      country,
      address: cleanAddr,
      location: await locationFor(cleanAddr, country, coordinates),
      accessNeeds,
      preferredContactTime,
      over18,
      acceptedTerms,
      acceptedPrivacy,
      role: "customer",
      isVerified: true,
    });

    await user.save();

    res.cookie("token", signToken(user), COOKIE_OPTIONS());
    await sendWelcome(authTemplates.welcomeCustomer, email, fullName);

    res.status(201).json({
      message: "Customer registered successfully",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        country: user.country,
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
      coordinates,
      nin,
    } = req.body;
    const country = normalizeCountry(req.body.country);

    // Check if user exists
    const existingUser = await User.findOne({ email: String(email).toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Validate required fields
    if (!fullName || !email || !phoneNumber || !password) {
      return res
        .status(400)
        .json({ message: "Please fill in all required fields" });
    }

    if (!over18) {
      return res
        .status(400)
        .json({ message: "You must be over 18 to register" });
    }

    if (!acceptedTerms || !acceptedPrivacy || !informationTrue) {
      return res
        .status(400)
        .json({ message: "Please accept all terms and conditions" });
    }

    // Create user
    const user = new User({
      fullName,
      email,
      phoneNumber,
      password,
      role: "provider",
      country,
      dateOfBirth: new Date(dateOfBirth),
      address: cleanAddress(address, country),
      bankDetails: cleanBankDetails(bankDetails, country),
      nin: country === "NG" ? nin : undefined,
      renderCareServices: renderCareServices || false,
      over18,
      acceptedTerms,
      acceptedPrivacy,
      informationTrue,
      verificationStatus: "pending",
      isActive: true,
      isVerified: false,
      // Initialize with empty serviceCategories - they can add later in profile
      serviceCategories: [],
      location: await locationFor(cleanAddress(address, country), country, coordinates),
    });

    await user.save();

    // Create provider profile
    const providerProfile = new ProviderProfile({
      userId: user._id,
      serviceCategories: [],
      verificationStatus: "pending",
      isVerified: false,
      about: "",
      completedJobs: 0,
      totalEarnings: 0,
      completionRate: 0,
    });

    await providerProfile.save();

    // Create wallet
    const wallet = new Wallet({
      userId: user._id,
      balance: 0,
      totalEarned: 0,
      currency: getCountry(country).currency,
    });

    await wallet.save();

    res.cookie("token", signToken(user), COOKIE_OPTIONS());
    await sendWelcome(authTemplates.welcomeProvider, email, fullName);

    res.status(201).json({
      message: "Provider registered successfully",
      // token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        country: user.country,
        serviceCategories: user.serviceCategories || [],
        verificationStatus: user.verificationStatus,
        isActive: user.isActive,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("❌ Register provider error:", error);
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
      coordinates,
      nin,
    } = req.body;
    const country = normalizeCountry(req.body.country);

    if (!over18) {
      return res.status(400).json({ message: "You must be over 18 to register" });
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      return res.status(400).json({ message: "Please accept the terms and privacy policy" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: String(email).toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const cleanAddr = cleanAddress(address, country);
    const location = await locationFor(cleanAddr, country, coordinates);

    const user = new User({
      fullName,
      dateOfBirth,
      email,
      phoneNumber,
      password,
      country,
      address: cleanAddr,
      location,
      bankDetails: cleanBankDetails(bankDetails, country),
      nin: country === "NG" ? nin : undefined,
      renderCareServices,
      over18,
      acceptedTerms,
      acceptedPrivacy,
      role: "errand_runner",
      verificationStatus: "pending",
    });

    await user.save();

    // Create errand runner profile
    const errandRunnerProfile = new ErrandRunnerProfileModel({
      userId: user._id,
      dateOfBirth,
      phoneNumber,
      address: cleanAddr,
      bankDetails: cleanBankDetails(bankDetails, country),
      vehicleType: vehicleType || "walking",
      vehicleRegistration,
      vehicleInsurance,
      drivingLicence,
      maxWeightCapacity: maxWeightCapacity || 10,
      maxDistancePreference: maxDistancePreference || 10,
      preferredAreas: preferredAreas || [cleanAddr.town].filter(Boolean),
      availableDays: availableDays || {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
      },
      availableHours: availableHours || { start: "08:00", end: "18:00" },
      verificationStatus: "pending",
      verificationSubmittedAt: new Date(),
      location,
    });

    await errandRunnerProfile.save();

    // Create wallet
    const wallet = new Wallet({
      userId: user._id,
      currency: getCountry(country).currency,
    });

    await wallet.save();

    res.cookie("token", signToken(user), COOKIE_OPTIONS());
    await sendWelcome(authTemplates.welcomeErrandRunner, email, fullName);

    res.status(201).json({
      message: "Errand runner registered successfully. Awaiting verification.",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        country: user.country,
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

    const user = await User.findOne({ email: String(email).toLowerCase(), role: { $ne: "admin" } }).select(
      "+password"
    );
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account is deactivated" });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if provider is verified
    if (user.role === "provider" && user.verificationStatus !== "approved") {
      return res.status(403).json({
        message:
          "Your account is not verified yet. Please wait for admin approval.",
        verificationStatus: user.verificationStatus,
      });
    }

    res.cookie("token", signToken(user), COOKIE_OPTIONS());

    res.json({
      message: "Login successful",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        country: user.country || "GB",
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
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.json({ message: "Logged out successfully" });
};

// Get current user
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    let providerProfile = null;
    if (user.role === "provider") {
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
