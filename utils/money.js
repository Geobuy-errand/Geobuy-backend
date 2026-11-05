const { getCountry, getCountryByCurrency } = require('../config/countries');

/** Round to 2 decimal places without floating point drift. */
function round2(value) {
  const n = Number(value) || 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Format an amount for display, e.g. formatMoney(1500, 'NGN') -> "₦1,500.00".
 * `currencyOrCountry` may be a currency code (GBP/NGN) or a country code (GB/NG).
 */
function formatMoney(amount, currencyOrCountry = 'GBP') {
  const key = String(currencyOrCountry || 'GBP').toUpperCase();
  const country = key.length === 2 ? getCountry(key) : getCountryByCurrency(key);
  const value = round2(amount);
  try {
    return new Intl.NumberFormat(country.locale, {
      style: 'currency',
      currency: country.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch (e) {
    return `${country.currencySymbol}${value.toFixed(2)}`;
  }
}

/** Amount in the smallest currency unit (pence / kobo) for payment gateways. */
function toMinorUnits(amount, currency = 'GBP') {
  const country = getCountryByCurrency(currency);
  return Math.round(round2(amount) * country.minorUnit);
}

function fromMinorUnits(amount, currency = 'GBP') {
  const country = getCountryByCurrency(currency);
  return round2((Number(amount) || 0) / country.minorUnit);
}

module.exports = { round2, formatMoney, toMinorUnits, fromMinorUnits };
