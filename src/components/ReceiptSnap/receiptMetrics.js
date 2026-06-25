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
