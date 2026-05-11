const TaxRule = require('../models/TaxRule');

const COUNTRY_ALIASES = {
  IN: 'IN',
  INDIA: 'IN',
  UK: 'UK',
  GB: 'UK',
  GBR: 'UK',
  'UNITED KINGDOM': 'UK',
  BRITAIN: 'UK',
  'GREAT BRITAIN': 'UK'
};

const normalizeCountryCode = (value) => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  return COUNTRY_ALIASES[normalized] || normalized;
};

const createTaxRuleService = ({ defaultRules = [] } = {}) => {
  const ensureDefaultTaxRules = async () => {
    await Promise.all(
      defaultRules.map((rule) =>
        TaxRule.findOneAndUpdate(
          { country: normalizeCountryCode(rule.country) },
          {
            $setOnInsert: {
              country: normalizeCountryCode(rule.country),
              label: rule.label,
              rate: Number(rule.rate || 0),
              registrationNumber: rule.registrationNumber || ''
            }
          },
          {
            new: true,
            upsert: true
          }
        )
      )
    );
  };

  const findByCountry = async (country) => {
    const normalizedCountry = normalizeCountryCode(country);
    if (!normalizedCountry) {
      return null;
    }

    return TaxRule.findOne({ country: normalizedCountry }).lean();
  };

  return {
    ensureDefaultTaxRules,
    findByCountry
  };
};

module.exports = {
  createTaxRuleService,
  normalizeCountryCode
};
