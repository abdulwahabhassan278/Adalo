export const bytesToKilobytes = (bytes, digits = 1) => (
  (bytes / 1024).toFixed(digits)
);

export const calculateReductionPercent = (originalSize, compressedSize) => (
  (1 - compressedSize / originalSize) * 100
).toFixed(1);

export const normalizeConfidence = (confidence = 0) => (
  Math.min(Math.max(confidence, 0), 1)
);

export const formatConfidencePercent = (confidence = 0) => (
  (normalizeConfidence(confidence) * 100).toFixed(1)
);
