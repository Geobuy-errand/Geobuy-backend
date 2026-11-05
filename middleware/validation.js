const { body, validationResult } = require('express-validator');
const { normalizeCountry, isSupportedCountry } = require('../config/countries');

const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map((validation) => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const firstError = errors.array()[0];
    res.status(400).json({
      success: false,
      message: firstError.msg,
    });
  };
};

// ------------------------------------------------------------
// Country-aware field rules
// ------------------------------------------------------------
const UK_PHONE =
  /^(?:(?:\(?(?:0(?:0|11)\)?[\s-]?\(?|\+)44\)?[\s-]?(?:\(?0\)?[\s-]?)?)|(?:\(?0))(?:(?:[\d]{5}\)?[\s-]?[\d]{4,5})|(?:[\d]{4}\)?[\s-]?(?:[\d]{5}|[\d]{3}[\s-]?[\d]{3}))|(?:[\d]{3}\)?[\s-]?[\d]{3}[\s-]?[\d]{3,4})|(?:[\d]{2}\)?[\s-]?[\d]{4}[\s-]?[\d]{4}))(?:[\s-]?(?:x|ext\.?|#)\d{3,4})?$/;
// Nigerian mobile: 0803 123 4567, +234 803 123 4567, 2348031234567
const NG_PHONE = /^(?:\+?234[\s-]?|0)[789][01]\d[\s-]?\d{3}[\s-]?\d{4}$/;
const UK_POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/i;
const NG_POSTCODE = /^\d{6}$/;

const countryOf = (req) => normalizeCountry(req.body?.country);

const countryRule = body('country')
  .optional()
  .custom((v) => isSupportedCountry(v))
  .withMessage('Country must be United Kingdom (GB) or Nigeria (NG)')
  .customSanitizer((v) => normalizeCountry(v));

const phoneRule = body('phoneNumber').custom((value, { req }) => {
  const v = String(value || '').trim();
  if (countryOf(req) === 'NG') {
    if (!NG_PHONE.test(v)) throw new Error('Valid Nigerian phone number is required (e.g. 0803 123 4567)');
  } else if (!UK_PHONE.test(v)) {
    throw new Error('Valid UK phone number is required');
  }
  return true;
});

const addressRules = [
  body('address.street').notEmpty().withMessage('Street address is required'),
  body('address.town').notEmpty().withMessage('Town / city is required'),
  body('address.state').custom((value, { req }) => {
    if (countryOf(req) === 'NG' && !String(value || '').trim()) throw new Error('State is required');
    return true;
  }),
  body('address.postcode').custom((value, { req }) => {
    const v = String(value || '').trim();
    if (countryOf(req) === 'NG') {
      // Postcodes are rarely used in Nigeria — optional, but must be 6 digits if given.
      if (v && !NG_POSTCODE.test(v)) throw new Error('Nigerian postal codes are 6 digits');
      return true;
    }
    if (!UK_POSTCODE.test(v)) throw new Error('Valid UK postcode is required');
    return true;
  }),
];

const passwordRule = body('password')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters')
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .withMessage('Password must contain at least one uppercase, one lowercase, and one number');

// UK: sort code + 8-digit account. Nigeria: bank code + 10-digit NUBAN.
// Bank details are optional at sign-up for Nigeria (they can be added and
// verified with Paystack later from the wallet page).
const bankRules = (required) => [
  body('bankDetails').custom((value, { req }) => {
    const b = value || {};
    const country = countryOf(req);
    const any = b.accountNumber || b.sortCode || b.bankCode;
    if (!required && !any) return true;
    if (country === 'NG') {
      if (!any) return true;
      if (!/^\d{10}$/.test(String(b.accountNumber || ''))) throw new Error('Nigerian account numbers (NUBAN) are 10 digits');
      if (!b.bankCode && !b.bankName) throw new Error('Please select your bank');
      return true;
    }
    if (!String(b.sortCode || '').replace(/[\s-]/g, '').match(/^\d{6}$/)) throw new Error('Sort code is required (6 digits)');
    if (!/^\d{8}$/.test(String(b.accountNumber || ''))) throw new Error('Valid 8-digit account number is required');
    return true;
  }),
];

const consentRules = [
  body('over18').isBoolean().withMessage('Must confirm over 18'),
  body('acceptedTerms').isBoolean().withMessage('Must accept terms'),
  body('acceptedPrivacy').isBoolean().withMessage('Must accept privacy policy'),
];

const userValidationRules = {
  registerCustomer: [
    countryRule,
    body('fullName').notEmpty().withMessage('Full name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    phoneRule,
    ...addressRules,
    passwordRule,
    ...consentRules,
  ],
  registerProvider: [
    countryRule,
    body('fullName').notEmpty().withMessage('Full name is required'),
    body('dateOfBirth').isDate().withMessage('Valid date of birth is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    phoneRule,
    ...addressRules,
    passwordRule,
    ...bankRules(true),
    ...consentRules,
    body('informationTrue').isBoolean().withMessage('Must confirm information is true'),
  ],
  registerErrandRunner: [
    countryRule,
    body('fullName').notEmpty().withMessage('Full name is required'),
    body('dateOfBirth').isDate().withMessage('Valid date of birth is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    phoneRule,
    ...addressRules,
    passwordRule,
    ...bankRules(false),
    ...consentRules,
  ],
  login: [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  booking: [
    body('serviceId').isMongoId().withMessage('Valid service ID is required'),
    body('pickup.address').notEmpty().withMessage('Pickup address is required'),
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

module.exports = { validate, userValidationRules, UK_PHONE, NG_PHONE, UK_POSTCODE };
