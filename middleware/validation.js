const { body, validationResult } = require('express-validator');

const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map((validation) => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // Get the first error message only
    const firstError = errors.array()[0];
    
    res.status(400).json({
      success: false,
      message: firstError.msg
    });
  };
};

// Common validation rules
const userValidationRules = {
  registerCustomer: [
    body('fullName').notEmpty().withMessage('Full name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phoneNumber')
      .matches(/^(?:(?:\(?(?:0(?:0|11)\)?[\s-]?\(?|\+)44\)?[\s-]?(?:\(?0\)?[\s-]?)?)|(?:\(?0))(?:(?:[\d]{5}\)?[\s-]?[\d]{4,5})|(?:[\d]{4}\)?[\s-]?(?:[\d]{5}|[\d]{3}[\s-]?[\d]{3}))|(?:[\d]{3}\)?[\s-]?[\d]{3}[\s-]?[\d]{3,4})|(?:[\d]{2}\)?[\s-]?[\d]{4}[\s-]?[\d]{4}))(?:[\s-]?(?:x|ext\.?|\#)\d{3,4})?$/)
      .withMessage('Valid UK phone number is required'),
    body('address.street').notEmpty().withMessage('Street address is required'),
    body('address.town').notEmpty().withMessage('Town is required'),
    body('address.postcode')
      .matches(/^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/i)
      .withMessage('Valid UK postcode is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one uppercase, one lowercase, and one number'),
    body('over18').isBoolean().withMessage('Must confirm over 18'),
    body('acceptedTerms').isBoolean().withMessage('Must accept terms'),
    body('acceptedPrivacy').isBoolean().withMessage('Must accept privacy policy'),
  ],
  registerProvider: [
    body('fullName').notEmpty().withMessage('Full name is required'),
    body('dateOfBirth').isDate().withMessage('Valid date of birth is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phoneNumber')
      .matches(/^(?:(?:\(?(?:0(?:0|11)\)?[\s-]?\(?|\+)44\)?[\s-]?(?:\(?0\)?[\s-]?)?)|(?:\(?0))(?:(?:[\d]{5}\)?[\s-]?[\d]{4,5})|(?:[\d]{4}\)?[\s-]?(?:[\d]{5}|[\d]{3}[\s-]?[\d]{3}))|(?:[\d]{3}\)?[\s-]?[\d]{3}[\s-]?[\d]{3,4})|(?:[\d]{2}\)?[\s-]?[\d]{4}[\s-]?[\d]{4}))(?:[\s-]?(?:x|ext\.?|\#)\d{3,4})?$/)
      .withMessage('Valid UK phone number is required'),
    body('address.street').notEmpty().withMessage('Street address is required'),
    body('address.town').notEmpty().withMessage('Town is required'),
    body('address.postcode')
      .matches(/^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/i)
      .withMessage('Valid UK postcode is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one uppercase, one lowercase, and one number'),
    body('bankDetails.sortCode').notEmpty().withMessage('Sort code is required'),
    body('bankDetails.accountNumber')
      .isLength({ min: 8, max: 8 })
      .withMessage('Valid account number is required'),
    body('over18').isBoolean().withMessage('Must confirm over 18'),
    body('acceptedTerms').isBoolean().withMessage('Must accept terms'),
    body('acceptedPrivacy').isBoolean().withMessage('Must accept privacy policy'),
    body('informationTrue').isBoolean().withMessage('Must confirm information is true'),
  ],
  login: [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  booking: [
    body('serviceId').isMongoId().withMessage('Valid service ID is required'),
    body('pickup.address').notEmpty().withMessage('Pickup address is required'),
    body('pickup.postcode')
      .matches(/^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/i)
      .withMessage('Valid UK postcode is required'),
    body('date').isISO8601().withMessage('Valid date is required'),
    body('time').notEmpty().withMessage('Time is required'),
    body('estimatedPrice').isNumeric().withMessage('Valid price is required'),
  ],
  review: [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('comment').optional().isLength({ max: 500 }).withMessage('Comment must be less than 500 characters'),
  ],
  message: [
    body('content')
      .notEmpty()
      .withMessage('Message content is required')
      .isLength({ max: 1000 })
      .withMessage('Message must be less than 1000 characters'),
  ],
};

module.exports = { validate, userValidationRules };