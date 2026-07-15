const UserModel = require("../models/User.model");
const jwt = require('jsonwebtoken')

class AuthController {
  static async registerCustomer(req, res) {
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
      const existingUser = await UserModel.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const user = new UserModel({
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
        role: "customer",
        isVerified: true,
      });

      await user.save();

      // Generate JWT
      const token = jwt.sign(
        { userId: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || "7d" }
      );

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        message: "Customer registered successfully",
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
  }
}

module.exports = AuthController;
