const Settings = require('../models/Setting.model');
const User = require('../models/User.model');

// Get settings (public - only returns non-sensitive settings)
exports.getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    
    // Return only public settings
    res.json({
      pricing: {
        baseFee: settings.pricing.baseFee,
        subscriptionDiscount: settings.pricing.subscriptionDiscount,
        heavyItemFee: settings.pricing.heavyItemFee,
        waitTimeFeePerMin: settings.pricing.waitTimeFeePerMin,
        waitTimeFreeMin: settings.pricing.waitTimeFreeMin,
        peakUrgentFee: settings.pricing.peakUrgentFee,
        extraStopFee: settings.pricing.extraStopFee,
        distanceTiers: settings.pricing.distanceTiers,
        platformFeePercentage: settings.pricing.platformFeePercentage,
      },
      platform: {
        name: settings.platform.name,
        currencySymbol: settings.platform.currencySymbol,
      },
      features: settings.features,
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get all settings (admin only)
exports.getAllSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json(settings);
  } catch (error) {
    console.error('Get all settings error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Update settings (admin only)
exports.updateSettings = async (req, res) => {
  try {
    const {
      pricing,
      platform,
      notifications,
      features,
    } = req.body;

    let settings = await Settings.getSettings();

    // Update pricing
    if (pricing) {
      settings.pricing = {
        ...settings.pricing,
        ...pricing,
      };
    }

    // Update platform
    if (platform) {
      settings.platform = {
        ...settings.platform,
        ...platform,
      };
    }

    // Update notifications
    if (notifications) {
      settings.notifications = {
        ...settings.notifications,
        ...notifications,
      };
    }

    // Update features
    if (features) {
      settings.features = {
        ...settings.features,
        ...features,
      };
    }

    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();

    await settings.save();

    // Log the update
    console.log(`Settings updated by ${req.user.fullName} (${req.user._id})`);

    res.json({
      message: 'Settings updated successfully',
      settings,
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Reset settings to defaults (admin only)
exports.resetSettings = async (req, res) => {
  try {
    await Settings.deleteMany({});
    const settings = await Settings.getSettings();
    
    res.json({
      message: 'Settings reset to defaults',
      settings,
    });
  } catch (error) {
    console.error('Reset settings error:', error);
    res.status(500).json({ message: error.message });
  }
};