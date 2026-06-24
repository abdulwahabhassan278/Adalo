import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform
} from 'react-native';
import {
  bytesToKilobytes,
  calculateReductionPercent,
  formatConfidencePercent,
  normalizeConfidence
} from './receiptMetrics';

const CONFIG = {
  SUPABASE_URL: 'https://miomghplfmksvrpdbcah.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pb21naHBsZm1rc3ZycGRiY2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwMTg4NzcsImV4cCI6MjA3MDU5NDg3N30.2eR5vDp1gqhOgDQziG7sCyJW_Ru3b2wOYIrBHeja0Rw',
  ACCOUNT_ID: 'a8c500ed-2321-4004-a0a1-8dca55c9ca78',
  MAX_IMAGE_SIZE: 1280,
  JPEG_QUALITY: 0.68 // Original quality for tuned mode
};

const ReceiptSnap = (props) => {
  const {
    primaryColor = '#3b82f6',
    backgroundColor = '#f5f7fa',
    timeoutSeconds = 70
  } = props;

  const timeoutMs = timeoutSeconds * 1000;
  const fileInputRef = useRef(null);

  // Mode must be selected FIRST
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processingTime, setProcessingTime] = useState(0);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [previewAspectRatio, setPreviewAspectRatio] = useState(null);
  const [uploadData, setUploadData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [compressionStats, setCompressionStats] = useState(null);

  useEffect(() => {
    let interval;
    if (processing) {
      const startTime = Date.now();
      interval = setInterval(() => {
        setProcessingTime(((Date.now() - startTime) / 1000).toFixed(1));
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [processing]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.jpg,.jpeg,.png,image/jpeg,image/png';
      input.style.display = 'none';
      input.onchange = handleWebFileSelect;
      document.body.appendChild(input);
      fileInputRef.current = input;

      return () => {
        if (input && input.parentNode) {
          input.parentNode.removeChild(input);
        }
      };
    }
  }, [selectedModel]);

  // Compress image for TUNED mode only
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const originalSize = file.size;

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          const maxDim = CONFIG.MAX_IMAGE_SIZE;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Grayscale conversion for Tuned mode
          if (selectedModel === 'tuned') {
            const imageData = ctx.getImageData(0, 0, width, height);
            const pixels = imageData.data;
            for (let i = 0; i < pixels.length; i += 4) {
              const r = pixels[i];
              const g = pixels[i + 1];
              const b = pixels[i + 2];
              // Using luminance method for grayscale
              const gray = 0.299 * r + 0.587 * g + 0.114 * b;
              pixels[i] = gray;     // Red
              pixels[i + 1] = gray; // Green
              pixels[i + 2] = gray; // Blue
            }
            ctx.putImageData(imageData, 0, 0);
          }

          canvas.toBlob(
            (blob) => {
              const compressionTime = Date.now() - startTime;
              const compressedSize = blob.size;
              const compressionRatio = calculateReductionPercent(originalSize, compressedSize);

              console.log(`[COMPRESSION] ${bytesToKilobytes(originalSize)}KB → ${bytesToKilobytes(compressedSize)}KB (${compressionRatio}% reduction in ${compressionTime}ms)`);

              setCompressionStats({
                originalSize,
                compressedSize,
                compressionRatio,
                compressionTime,
                originalDimensions: `${img.width}x${img.height}`,
                compressedDimensions: `${width}x${height}`
              });

              const blobReader = new FileReader();
              blobReader.onload = (be) => {
                const dataUrl = be.target.result;
                const base64Data = dataUrl.split(',')[1];
                resolve({
                  dataUrl,
                  base64Data,
                  blob,
                  width,
                  height,
                  size: compressedSize
                });
              };
              blobReader.onerror = reject;
              blobReader.readAsDataURL(blob);
            },
            'image/jpeg',
            CONFIG.JPEG_QUALITY // Apply the quality here
          );
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleWebFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const extension = file.name.toLowerCase().split('.').pop();

    if (!file.type.startsWith('image/') && !['jpg', 'jpeg', 'png'].includes(extension)) {
      Alert.alert('Invalid File', 'Please select an image file (JPEG/PNG).');
      return;
    }

    try {
      // TUNED mode: compress and grayscale before upload
      if (selectedModel === 'tuned') {
        setProcessingStage('Compressing and grayscaling image for tuned mode...');

        const compressed = await compressImage(file);

        setPreviewAspectRatio(compressed.width / compressed.height);
        setSelectedImage(compressed.dataUrl);
        setImageData(compressed.base64Data);
        setImageInfo({
          size: compressed.size,
          name: file.name.replace(/\.[^/.]+$/, '.jpg'),
          type: 'image/jpeg',
          extension: 'jpg',
          originalSize: file.size
        });
        setResults(null);
        setError(null);
        setUploadData(null);
        setProcessingStage('');

        await uploadImageToDatabase(compressed.base64Data, {
          ...file,
          name: file.name.replace(/\.[^/.]+$/, '.jpg'),
          type: 'image/jpeg',
          size: compressed.size
        });
      }
      // BASELINE mode: upload original without compression or grayscale
      else {
        setProcessingStage('Loading image...');

        const reader = new FileReader();
        reader.onload = async (e) => {
          const dataUrl = e.target.result;
          const base64Data = dataUrl.split(',')[1];

          Image.getSize(dataUrl, (width, height) => {
            setPreviewAspectRatio(width / height);
          }, (err) => {
            console.error('Failed to get image size:', err);
            setPreviewAspectRatio(0.75);
          });

          setSelectedImage(dataUrl);
          setImageData(base64Data);
          setImageInfo({
            size: file.size,
            name: file.name,
            type: file.type,
            extension: extension
          });
          setResults(null);
          setError(null);
          setUploadData(null);
          setProcessingStage('');

          await uploadImageToDatabase(base64Data, file);
        };
        reader.onerror = () => {
          Alert.alert('Error', 'Failed to read the image file.');
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      setProcessingStage('');
      Alert.alert('Error', 'Failed to process image: ' + err.message);
      console.error('Image processing error:', err);
    }
  };

  const pickImage = () => {
    if (!selectedModel) {
      Alert.alert('Select Mode First', 'Please select Baseline or Tuned mode before uploading an image.');
      return;
    }

    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      Alert.alert('Platform Not Supported', 'Image selection is only available on web platform.');
    }
  };

  const uploadImageToDatabase = async (base64Data, file) => {
    setUploading(true);
    setError(null);

    try {
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const filename = file.name;
      const mimeType = file.type;

      const presignPayload = {
        account_id: CONFIG.ACCOUNT_ID,
        filename,
        mime_type: mimeType
      };

      const presignResponse = await fetch(
        `${CONFIG.SUPABASE_URL}/functions/v1/presign-upload`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify(presignPayload)
        }
      );

      if (!presignResponse.ok) {
        const errorText = await presignResponse.text();
        throw new Error(`Failed to get upload URL (${presignResponse.status}): ${errorText}`);
      }

      const uploadDataResponse = await presignResponse.json();

      const uploadResponse = await fetch(uploadDataResponse.upload_url, {
        method: 'PUT',
        body: bytes,
        headers: {
          'Content-Type': mimeType,
          'x-ms-blob-type': 'BlockBlob'
        }
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload file (${uploadResponse.status})`);
      }

      setUploadData(uploadDataResponse);

      // Auto-start processing immediately after upload
      setTimeout(() => {
        processReceipt(uploadDataResponse);
      }, 500);

    } catch (err) {
      const errorMsg = err.message;
      setError(errorMsg);
      Alert.alert('Upload Error', errorMsg);
      setSelectedImage(null);
      setImageData(null);
      setImageInfo(null);
    } finally {
      setUploading(false);
    }
  };

  const processReceipt = async (uploadDataParam) => {
    const dataToUse = uploadDataParam || uploadData;

    if (!dataToUse) {
      Alert.alert('Error', 'Image not uploaded yet.');
      return;
    }

    setProcessing(true);
    setError(null);
    setProcessingTime(0);
    setProcessingStage('Sending to OCR...');

    try {
      setTimeout(() => setProcessingStage('Analyzing receipt...'), 1000);
      setTimeout(() => setProcessingStage('Extracting fields...'), 2000);

      const processPayload = {
        receipt_id: dataToUse.receipt_id,
        image_path: dataToUse.path,
        account_id: CONFIG.ACCOUNT_ID,
        mode: selectedModel
      };

      const processResponse = await Promise.race([
        fetch(`${CONFIG.SUPABASE_URL}/functions/v1/process-receipt`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify(processPayload)
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeoutMs)
        )
      ]);

      if (!processResponse.ok) {
        const errorText = await processResponse.text();
        throw new Error(`Failed to process receipt (${processResponse.status}): ${errorText}`);
      }

      const result = await processResponse.json();
      setProcessingStage('Complete!');
      setTimeout(() => {
        setResults(result);
        Alert.alert('Success', `Receipt processed in ${(result.processing_time_ms / 1000).toFixed(2)}s!`);
      }, 500);
    } catch (err) {
      const errorMsg = err.message === 'timeout'
        ? 'Processing is taking longer than expected'
        : err.message;
      setError(errorMsg);
      setProcessingStage('');
      Alert.alert('Error', errorMsg);
    } finally {
      setTimeout(() => {
        setProcessing(false);
        setProcessingStage('');
      }, 500);
    }
  };

  const resetForm = () => {
    setSelectedImage(null);
    setImageData(null);
    setImageInfo(null);
    setResults(null);
    setError(null);
    setSelectedModel(null);
    setPreviewAspectRatio(null);
    setUploadData(null);
    setProcessingStage('');
    setCompressionStats(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getConfidenceStyle = (confidence) => {
    const normalizedConfidence = normalizeConfidence(confidence);
    if (normalizedConfidence >= 0.9) return styles.confidenceHigh;
    if (normalizedConfidence >= 0.7) return styles.confidenceMedium;
    return styles.confidenceLow;
  };

  const getConfidenceTextColor = (confidence) => {
    const normalizedConfidence = normalizeConfidence(confidence);
    if (normalizedConfidence >= 0.9) return '#15803d';
    if (normalizedConfidence >= 0.7) return '#a16207';
    return '#991b1b';
  };

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: backgroundColor,
    },
    btnPrimary: {
      backgroundColor: primaryColor,
    },
    timer: {
      fontSize: 20,
      fontWeight: '600',
      color: primaryColor,
      marginTop: 12,
    },
  }), [backgroundColor, primaryColor]);

  return (
    <ScrollView style={[styles.container, dynamicStyles.container]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Receipt Processor M3.2</Text>
          <Text style={styles.headerSubtitle}>
            Select mode → Upload → Auto-process
          </Text>
        </View>

        {/* STEP 1: Mode Selection - MUST BE FIRST */}
        <View style={styles.modelSection}>
          <Text style={styles.sectionTitle}>Step 1: Select Processing Mode</Text>
          <Text style={styles.sectionHint}>
            Choose before uploading • Tuned: Auto-compressed to 1280px @ 68% and grayscaled • Baseline: Original quality
          </Text>
          <View style={styles.modelOptionsContainer}>
            <TouchableOpacity
              style={[
                styles.modelOption,
                selectedModel === 'tuned' && styles.modelOptionSelected,
                (processing || uploading) && styles.modelOptionDisabled
              ]}
              onPress={() => setSelectedModel('tuned')}
              disabled={processing || uploading}
            >
              <Text style={styles.modelOptionEmoji}>⚡</Text>
              <Text style={styles.modelOptionText}>Tuned</Text>
              <Text style={styles.modelOptionDesc}>Fast • Compressed • Grayscale</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modelOption,
                selectedModel === 'baseline' && styles.modelOptionSelected,
                (processing || uploading) && styles.modelOptionDisabled
              ]}
              onPress={() => setSelectedModel('baseline')}
              disabled={processing || uploading}
            >
              <Text style={styles.modelOptionEmoji}>📷</Text>
              <Text style={styles.modelOptionText}>Baseline</Text>
              <Text style={styles.modelOptionDesc}>Standard • Original</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* STEP 2: Upload (only enabled after mode selection) */}
        <TouchableOpacity
          style={[
            styles.uploadArea,
            !selectedModel && styles.uploadAreaDisabled,
            (processing || uploading) && styles.uploadAreaDisabled
          ]}
          onPress={pickImage}
          disabled={!selectedModel || processing || uploading}
          activeOpacity={0.7}
        >
          <Text style={styles.uploadIcon}>
            {selectedModel === 'tuned' ? '⚡📤' : '📤'}
          </Text>
          <Text style={styles.uploadText}>
            {!selectedModel ? 'Select mode above first' :
              selectedImage ? 'Change Image' :
              `Step 2: Upload Receipt (${selectedModel} mode)`}
          </Text>
          <Text style={styles.uploadHint}>
            {selectedModel === 'tuned' ?
              'Will auto-compress to 1280px @ 68% quality and convert to grayscale' :
              selectedModel === 'baseline' ?
              'Will upload original image without compression or grayscale' :
              'Choose Baseline or Tuned mode above'}
          </Text>
        </TouchableOpacity>

        {compressionStats && (
          <View style={styles.compressionBanner}>
            <Text style={styles.compressionIcon}>⚡</Text>
            <View style={styles.compressionInfo}>
              <Text style={styles.compressionTitle}>Image Optimized (Tuned Mode)</Text>
              <Text style={styles.compressionDetails}>
                {compressionStats.originalDimensions} → {compressionStats.compressedDimensions} •
                {bytesToKilobytes(compressionStats.originalSize, 0)}KB → {bytesToKilobytes(compressionStats.compressedSize, 0)}KB
                ({compressionStats.compressionRatio}% smaller) in {compressionStats.compressionTime}ms
              </Text>
            </View>
          </View>
        )}

        {selectedImage && (
          <View style={styles.previewContainer}>
            {uploading && (
              <View style={styles.uploadingBanner}>
                <ActivityIndicator size="small" color="#3b82f6" />
                <Text style={styles.uploadingText}>
                  Uploading {selectedModel === 'tuned' ? 'compressed and grayscaled' : 'original'} image...
                </Text>
              </View>
            )}

            <Image
              source={{ uri: selectedImage }}
              style={[
                styles.previewImage,
                { aspectRatio: previewAspectRatio || 0.75 }
              ]}
            />
            {imageInfo && imageInfo.size > 0 && (
              <View style={styles.fileInfo}>
                <Text style={styles.fileInfoText}>
                  {imageInfo.name} • {bytesToKilobytes(imageInfo.size)}KB
                  {imageInfo.originalSize && imageInfo.originalSize !== imageInfo.size &&
                    ` (was ${bytesToKilobytes(imageInfo.originalSize)}KB)`
                  }
                </Text>
              </View>
            )}
          </View>
        )}

        {(results || error) && (
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary]}
            onPress={resetForm}
          >
            <Text style={styles.btnSecondaryText}>Process Another Receipt</Text>
          </TouchableOpacity>
        )}

        {processing && (
          <View style={styles.processingOverlay}>
            <View style={styles.processingCard}>
              <ActivityIndicator size="large" color={primaryColor} />
              <Text style={styles.processingText}>Processing Receipt...</Text>
              <Text style={styles.processingSubtext}>
                {selectedModel === 'tuned' ? 'Using fast optimized endpoint with grayscale image' : 'Using baseline endpoint'}
              </Text>
              <Text style={dynamicStyles.timer}>{processingTime}s</Text>

              {processingStage && (
                <View style={styles.progressStageContainer}>
                  <View style={styles.progressDot} />
                  <Text style={styles.progressStageText}>{processingStage}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {results && results.success && results.fields && (
          <View style={styles.results}>
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultTitle}>Extracted Information</Text>
                <View style={[styles.modeBadge, selectedModel === 'tuned' ? styles.modeBadgeTuned : styles.modeBadgeBaseline]}>
                  <Text style={styles.modeBadgeText}>{selectedModel === 'tuned' ? '⚡ Tuned' : '📷 Baseline'}</Text>
                </View>
              </View>

              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Store Name:</Text>
                <Text style={styles.resultValue}>
                  {results.fields.store_name || 'N/A'}
                </Text>
              </View>

              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Confidence:</Text>
                <View style={[
                  styles.confidence,
                  getConfidenceStyle(results.fields.store_confidence || 0)
                ]}>
                  <Text style={[
                    styles.confidenceText,
                    { color: getConfidenceTextColor(results.fields.store_confidence || 0) }
                  ]}>
                    {formatConfidencePercent(results.fields.store_confidence)}%
                  </Text>
                </View>
              </View>

              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Date:</Text>
                <Text style={styles.resultValue}>
                  {results.fields.date || 'N/A'}
                </Text>
              </View>

              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Total Amount:</Text>
                <Text style={styles.resultValue}>
                  {results.fields.total_amount
                    ? `$${results.fields.total_amount.toFixed(2)}`
                    : 'N/A'}
                </Text>
              </View>

              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Processing Time:</Text>
                <Text style={[styles.resultValue, styles.resultValueHighlight]}>
                  {(results.processing_time_ms / 1000).toFixed(2)}s
                </Text>
              </View>
            </View>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>❌ {error}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  content: {
    padding: 20,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  modelSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  modelOptionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modelOption: {
    flex: 1,
    padding: 16,
    marginHorizontal: 6,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  modelOptionSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  modelOptionDisabled: {
    opacity: 0.5,
  },
  modelOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  uploadArea: {
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#fafafa',
    marginBottom: 24,
  },
  uploadAreaDisabled: {
    opacity: 0.6,
  },
  uploadIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  uploadHint: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  previewContainer: {
    marginBottom: 24,
  },
  previewImage: {
    width: '100%',
    resizeMode: 'contain',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  fileInfo: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  fileInfoText: {
    fontSize: 14,
    color: '#4b5563',
  },
  btn: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnSecondary: {
    backgroundColor: '#f3f4f6',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  btnSecondaryText: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '600',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  processingCard: {
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    maxWidth: 360,
    width: '90%',
  },
  processingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 8,
  },
  processingSubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  results: {
    marginTop: 24,
  },
  resultCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 20,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  resultLabel: {
    fontWeight: '500',
    color: '#4b5563',
  },
  resultValue: {
    color: '#1a1a1a',
    textAlign: 'right',
    flex: 1,
    marginLeft: 8,
  },
  confidence: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '500',
  },
  confidenceHigh: {
    backgroundColor: '#dcfce7',
  },
  confidenceMedium: {
    backgroundColor: '#fef9c3',
  },
  confidenceLow: {
    backgroundColor: '#fee2e2',
  },
  errorContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  errorText: {
    color: '#991b1b',
    fontSize: 14,
    fontWeight: '500',
  },
  uploadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  uploadingText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '500',
  },
  uploadSuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  uploadSuccessIcon: {
    fontSize: 18,
    color: '#15803d',
    fontWeight: 'bold',
  },
  uploadSuccessText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#15803d',
    fontWeight: '500',
  },
  progressStageContainer: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    marginRight: 10,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  progressStageText: {
    fontSize: 13,
    color: '#0c4a6e',
    fontWeight: '500',
    flex: 1,
  },
  compressionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  compressionIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  compressionInfo: {
    flex: 1,
  },
  compressionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#047857',
  },
  compressionDetails: {
    fontSize: 12,
    color: '#065f46',
    marginTop: 2,
  },
});

export default ReceiptSnap;
