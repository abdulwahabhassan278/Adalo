const EMPTY_VALUE = 'N/A';

const toFiniteNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const pickFirst = (source, keys) => {
  for (let i = 0; i < keys.length; i += 1) {
    const value = source[keys[i]];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return null;
};

const RECEIPT_FIELD_CONFIG = [
  {
    key: 'storeName',
    label: 'Store Name',
    valueKeys: ['store_name', 'merchant_name', 'vendor_name', 'store'],
    confidenceKeys: ['store_confidence', 'merchant_confidence'],
    required: true
  },
  {
    key: 'date',
    label: 'Date',
    valueKeys: ['date', 'receipt_date', 'transaction_date', 'purchase_date'],
    confidenceKeys: ['date_confidence', 'receipt_date_confidence'],
    required: true
  },
  {
    key: 'totalAmount',
    label: 'Total Amount',
    valueKeys: ['total_amount', 'total', 'grand_total', 'amount_total'],
    confidenceKeys: ['total_confidence', 'total_amount_confidence'],
    type: 'currency',
    required: true
  },
  {
    key: 'subtotal',
    label: 'Subtotal',
    valueKeys: ['subtotal', 'sub_total', 'net_amount'],
    confidenceKeys: ['subtotal_confidence', 'sub_total_confidence'],
    type: 'currency'
  },
  {
    key: 'tax',
    label: 'Tax',
    valueKeys: ['tax', 'tax_amount', 'sales_tax', 'vat'],
    confidenceKeys: ['tax_confidence', 'tax_amount_confidence'],
    type: 'currency'
  },
  {
    key: 'paymentMethod',
    label: 'Payment Method',
    valueKeys: ['payment_method', 'payment_type', 'card_type'],
    confidenceKeys: ['payment_confidence', 'payment_method_confidence']
  },
  {
    key: 'receiptNumber',
    label: 'Receipt Number',
    valueKeys: ['receipt_number', 'invoice_number', 'transaction_id', 'order_number'],
    confidenceKeys: ['receipt_number_confidence', 'invoice_number_confidence']
  }
];

export const bytesToKilobytes = (bytes = 0, digits = 1) => {
  const safeBytes = toFiniteNumber(bytes) || 0;
  return (safeBytes / 1024).toFixed(digits);
};

export const calculateReductionPercent = (originalSize, compressedSize) => {
  const safeOriginalSize = toFiniteNumber(originalSize);
  const safeCompressedSize = toFiniteNumber(compressedSize);

  if (!safeOriginalSize || safeCompressedSize === null) {
    return '0.0';
  }

  return Math.max((1 - safeCompressedSize / safeOriginalSize) * 100, 0).toFixed(1);
};

export const normalizeConfidence = (confidence = 0) => {
  const numericConfidence = toFiniteNumber(confidence);

  if (numericConfidence === null) {
    return 0;
  }

  const normalizedConfidence = numericConfidence > 1
    ? numericConfidence / 100
    : numericConfidence;

  return Math.min(Math.max(normalizedConfidence, 0), 1);
};

export const formatConfidencePercent = (confidence = 0) => (
  (normalizeConfidence(confidence) * 100).toFixed(1)
);

export const formatReceiptValue = (value, fallback = EMPTY_VALUE) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'string') {
    return value.trim() || fallback;
  }

  return String(value);
};

export const formatCurrency = (amount, currency = 'USD') => {
  const numericAmount = toFiniteNumber(amount);

  if (numericAmount === null) {
    return EMPTY_VALUE;
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(numericAmount);
  } catch (err) {
    return numericAmount.toFixed(2);
  }
};

export const formatDurationSeconds = (milliseconds = 0) => (
  `${((toFiniteNumber(milliseconds) || 0) / 1000).toFixed(2)}s`
);

export const buildReceiptSummary = (result = {}) => {
  const fields = result.fields || {};
  const currency = formatReceiptValue(pickFirst(fields, ['currency', 'currency_code']), 'USD');

  return {
    storeName: formatReceiptValue(pickFirst(fields, ['store_name', 'merchant_name', 'vendor_name', 'store'])),
    confidence: pickFirst(fields, ['store_confidence', 'merchant_confidence']) || 0,
    date: formatReceiptValue(pickFirst(fields, ['date', 'receipt_date', 'transaction_date', 'purchase_date'])),
    totalAmount: formatCurrency(pickFirst(fields, ['total_amount', 'total', 'grand_total', 'amount_total']), currency),
    processingTime: formatDurationSeconds(result.processing_time_ms || 0)
  };
};

export const buildReceiptFieldRows = (result = {}) => {
  const fields = result.fields || {};
  const currency = formatReceiptValue(pickFirst(fields, ['currency', 'currency_code']), 'USD');

  return RECEIPT_FIELD_CONFIG
    .map((field) => {
      const rawValue = pickFirst(fields, field.valueKeys);
      const value = field.type === 'currency'
        ? formatCurrency(rawValue, currency)
        : formatReceiptValue(rawValue);
      const rawConfidence = pickFirst(fields, field.confidenceKeys || []);
      const confidence = rawConfidence === null ? null : normalizeConfidence(rawConfidence);

      return {
        key: field.key,
        label: field.label,
        value,
        confidence,
        required: field.required || false
      };
    })
    .filter((field) => field.required || field.value !== EMPTY_VALUE);
};
