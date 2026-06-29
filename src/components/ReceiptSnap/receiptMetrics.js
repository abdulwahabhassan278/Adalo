export const bytesToKilobytes = (bytes = 0, digits = 1) => {
  const safeBytes = Number.isFinite(bytes) ? bytes : 0;
  return (safeBytes / 1024).toFixed(digits);
};

export const calculateReductionPercent = (originalSize, compressedSize) => {
  if (!originalSize || !Number.isFinite(originalSize) || !Number.isFinite(compressedSize)) {
    return '0.0';
  }

  return Math.max((1 - compressedSize / originalSize) * 100, 0).toFixed(1);
};

export const normalizeConfidence = (confidence = 0) => (
  Math.min(Math.max(confidence, 0), 1)
);

export const formatConfidencePercent = (confidence = 0) => (
  (normalizeConfidence(confidence) * 100).toFixed(1)
);

export const formatCurrency = (amount, currency = 'USD') => {
  if (!Number.isFinite(amount)) {
    return 'N/A';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
};

export const formatDurationSeconds = (milliseconds = 0) => (
  `${(milliseconds / 1000).toFixed(2)}s`
);

export const buildReceiptSummary = (result = {}) => {
  const fields = result.fields || {};

  return {
    storeName: fields.store_name || 'N/A',
    confidence: fields.store_confidence || 0,
    date: fields.date || 'N/A',
    totalAmount: formatCurrency(fields.total_amount),
    processingTime: formatDurationSeconds(result.processing_time_ms || 0)
  };
};
