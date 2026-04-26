import dayjs from 'dayjs';

const formatDate = (value) => dayjs(value).format('DD MMM YYYY, hh:mm A');
const formatCurrency = (value, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency
  }).format(value || 0);

export { formatDate, formatCurrency };

