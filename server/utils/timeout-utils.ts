/**
 * Smart timeout calculation based on operation type and image size
 * 
 * Provides intelligent timeout values that scale with:
 * - Operation complexity (bg-removal > shadow > upload/download)
 * - Image size (larger images get more time)
 * 
 * Maximum timeouts (base + 120s cap for very large images):
 * - Upload: 15s + 120s = 135s max
 * - Shadow: 30s + 120s = 150s max
 * - Background removal: 90s + 120s = 210s max
 * - Download: 20s + 120s = 140s max
 */

export type TimeoutOperation = 'upload' | 'shadow' | 'bg-removal' | 'download';

/**
 * Calculate appropriate timeout for an operation based on type and optional image size
 * 
 * @param operation - Type of operation being performed
 * @param imageSizeBytes - Optional size of image in bytes
 * @returns Timeout value in milliseconds
 */
export function calculateTimeout(operation: TimeoutOperation, imageSizeBytes?: number): number {
  const baseTimeouts: Record<TimeoutOperation, number> = {
    'upload': 15000,        // 15s for uploads
    'shadow': 30000,        // 30s for shadow transform
    'bg-removal': 90000,    // 90s for AI background removal
    'download': 20000       // 20s for downloads
  };
  
  let timeout = baseTimeouts[operation];
  
  // Add extra time for large images (>10MB)
  if (imageSizeBytes && imageSizeBytes > 10 * 1024 * 1024) {
    const sizeMB = imageSizeBytes / (1024 * 1024);
    const extraTime = Math.min(120000, (sizeMB - 10) * 2000); // +2s per MB over 10MB, max +120s
    timeout += extraTime;
    
    // Warn for very large images (>50MB) to help users understand longer processing times
    if (sizeMB > 50) {
      console.warn(`⚠️ [Timeout] Large image detected (${sizeMB.toFixed(2)}MB), using extended timeout of ${(timeout / 1000).toFixed(0)}s for ${operation}`);
    }
    
    console.log(`⏱️ [Timeout] Using timeout: ${timeout}ms for ${operation} (image size: ${sizeMB.toFixed(2)}MB, base: ${baseTimeouts[operation]}ms, extra: ${extraTime}ms)`);
  } else {
    const sizeMB = imageSizeBytes ? (imageSizeBytes / (1024 * 1024)).toFixed(2) : 'unknown';
    console.log(`⏱️ [Timeout] Using timeout: ${timeout}ms for ${operation} (image size: ${sizeMB}MB)`);
  }
  
  return timeout;
}

/**
 * Calculate image size from base64 data string
 * 
 * @param base64Data - Base64 encoded image data (with or without data URL prefix)
 * @returns Estimated size in bytes
 */
export function getImageSizeFromBase64(base64Data: string): number {
  // Strip data URL prefix if present (e.g., "data:image/png;base64,")
  const base64String = base64Data.replace(/^data:image\/[a-z]+;base64,/, '').replace(/\s/g, '');
  
  // Base64 is ~33% larger than binary (4 chars encode 3 bytes)
  // So actual size ≈ base64Length * 0.75
  const estimatedSize = base64String.length * 0.75;
  
  return estimatedSize;
}
