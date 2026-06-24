export const bytesToKilobytes = (bytes, digits = 1) => (
  (bytes / 1024).toFixed(digits)
);

export const calculateReductionPercent = (originalSize, compressedSize) => (
  (1 - compressedSize / originalSize) * 100
).toFixed(1);

export const formatConfidencePercent = (confidence = 0) => (
  (confidence * 100).toFixed(1)
);
