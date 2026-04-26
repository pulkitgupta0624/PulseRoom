const buildInvoiceNumber = () => `PR-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

module.exports = {
  buildInvoiceNumber
};

