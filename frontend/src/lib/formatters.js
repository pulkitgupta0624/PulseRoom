import dayjs from 'dayjs';

const formatDate = (value) => dayjs(value).format('DD MMM YYYY, hh:mm A');
const resolveLocale = (locale) => {
  if (locale) {
    return locale;
  }

  if (typeof navigator !== 'undefined') {
    return navigator.languages?.[0] || navigator.language || 'en-IN';
  }

  return 'en-IN';
};

const formatCurrency = (value, currency = 'INR', locale) =>
  new Intl.NumberFormat(resolveLocale(locale), {
    style: 'currency',
    currency
  }).format(value || 0);

export { formatDate, formatCurrency };
