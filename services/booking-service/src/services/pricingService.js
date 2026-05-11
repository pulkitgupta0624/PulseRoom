const { normalizeCurrencyCode } = require('./exchangeRateService');

const roundCurrencyAmount = (value) => Number((Number(value || 0)).toFixed(2));

const buildAcceptedCurrencies = ({ event, tier }) => {
  const currencies = [
    ...(event?.acceptedCurrencies || []),
    tier?.currency || 'INR'
  ]
    .map((currency) => normalizeCurrencyCode(currency))
    .filter((currency) => /^[A-Z]{3}$/.test(currency));

  return [...new Set(currencies.length ? currencies : ['INR'])];
};

const resolveSettlementCurrency = ({ event, tier, requestedCurrency }) => {
  const acceptedCurrencies = buildAcceptedCurrencies({ event, tier });
  const fallbackCurrency = normalizeCurrencyCode(tier?.currency || acceptedCurrencies[0] || 'INR');
  const settlementCurrency = requestedCurrency
    ? normalizeCurrencyCode(requestedCurrency)
    : acceptedCurrencies[0] || fallbackCurrency;

  return {
    acceptedCurrencies,
    settlementCurrency,
    isAccepted: acceptedCurrencies.includes(settlementCurrency)
  };
};

const calculatePricingBreakdown = async ({
  quantity,
  subtotalBaseAmount,
  discountBaseAmount = 0,
  baseCurrency,
  settlementCurrency,
  taxRule,
  taxRegistrationNumber,
  exchangeRateService,
  reportingCurrency = 'USD'
}) => {
  const safeQuantity = Math.max(1, Number(quantity || 1));
  const normalizedBaseCurrency = normalizeCurrencyCode(baseCurrency, 'INR');
  const normalizedSettlementCurrency = normalizeCurrencyCode(
    settlementCurrency,
    normalizedBaseCurrency
  );
  const normalizedReportingCurrency = normalizeCurrencyCode(reportingCurrency, 'USD');
  const baseSubtotal = roundCurrencyAmount(subtotalBaseAmount);
  const baseDiscountAmountRounded = roundCurrencyAmount(
    Math.min(baseSubtotal, Number(discountBaseAmount || 0))
  );
  const baseTaxableAmount = roundCurrencyAmount(baseSubtotal - baseDiscountAmountRounded);
  const taxRate = Number(taxRule?.rate || 0);
  const baseTaxAmount = roundCurrencyAmount(baseTaxableAmount * (taxRate / 100));
  const baseTotal = roundCurrencyAmount(baseTaxableAmount + baseTaxAmount);

  const exchangeRate = await exchangeRateService.getExchangeRate({
    fromCurrency: normalizedBaseCurrency,
    toCurrency: normalizedSettlementCurrency
  });
  const reportingExchangeRate = await exchangeRateService.getExchangeRate({
    fromCurrency: normalizedBaseCurrency,
    toCurrency: normalizedReportingCurrency
  });

  const subtotal = roundCurrencyAmount(baseSubtotal * exchangeRate);
  const discountAmount = roundCurrencyAmount(baseDiscountAmountRounded * exchangeRate);
  const taxableAmount = roundCurrencyAmount(subtotal - discountAmount);
  const taxAmount = roundCurrencyAmount(taxableAmount * (taxRate / 100));
  const total = roundCurrencyAmount(taxableAmount + taxAmount);

  return {
    baseCurrency: normalizedBaseCurrency,
    settlementCurrency: normalizedSettlementCurrency,
    exchangeRate: Number(exchangeRate.toFixed(6)),
    reportingCurrency: normalizedReportingCurrency,
    reportingExchangeRate: Number(reportingExchangeRate.toFixed(6)),
    baseUnitAmount: roundCurrencyAmount(baseSubtotal / safeQuantity),
    unitAmount: roundCurrencyAmount(subtotal / safeQuantity),
    baseSubtotal,
    subtotal,
    baseDiscountAmount: baseDiscountAmountRounded,
    discountAmount,
    baseTaxableAmount,
    taxableAmount,
    taxCountry: taxRule?.country || null,
    taxLabel: taxRule?.label || null,
    taxRate,
    baseTaxAmount,
    taxAmount,
    baseTotal,
    total,
    registrationNumber: taxRegistrationNumber || taxRule?.registrationNumber || '',
    reportingAmount: roundCurrencyAmount(baseTotal * reportingExchangeRate),
    reportingDiscountAmount: roundCurrencyAmount(baseDiscountAmountRounded * reportingExchangeRate)
  };
};

module.exports = {
  roundCurrencyAmount,
  buildAcceptedCurrencies,
  resolveSettlementCurrency,
  calculatePricingBreakdown
};
