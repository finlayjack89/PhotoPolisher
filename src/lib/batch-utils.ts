import type { IStorage } from "../../server/storage";

/**
 * Calculate the size of a base64-encoded string in bytes
 * Base64 encoding adds ~33% overhead, so actual size = length * 0.75
 */
const calculateBase64Size = (base64Data: string): number => {
  // Remove the data URL prefix if present (e.g., "data:image/png;base64,")
  const base64String = base64Data.includes(',') 
    ? base64Data.split(',')[1] 
    : base64Data;
  
  // Calculate actual byte size (base64 is ~1.33x the actual size)
  return Math.floor(base64String.length * 0.75);
};

/**
 * Calculate optimal batch size based on average image size
 * 
 * This function analyzes image sizes and returns an optimal batch size
 * to keep each batch well under the 300MB API limit (targeting 150-200MB).
 * 
 * Batch size strategy:
 * - Small images (< 5MB): batch up to 10 images
 * - Medium images (5-10MB): batch 7 images
 * - Large images (10-20MB): batch 5 images
 * - Very large images (> 20MB): batch 3 images
 * 
 * @param images - Array of images with either fileId or base64 data
 * @param storage - Optional storage instance to lookup file sizes (for backend use)
 * @returns Optimal batch size (3-10 images per batch)
 */
export const calculateOptimalBatchSize = async (
  images: Array<{ fileId?: string; data?: string }>,
  storage?: IStorage
): Promise<number> => {
  if (images.length === 0) {
    return 7; // Default fallback
  }

  let totalSize = 0;
  let validImageCount = 0;

  for (const image of images) {
    let imageSize = 0;

    // Try to get size from fileId first (more accurate, for backend use)
    if (image.fileId && storage) {
      try {
        const fileData = await storage.getFile(image.fileId);
        if (fileData) {
          imageSize = fileData.file.bytes;
        }
      } catch (error) {
        console.warn(`Failed to get file size for ${image.fileId}:`, error);
      }
    }

    // Fallback to base64 data if no fileId or storage lookup failed
    if (imageSize === 0 && image.data) {
      imageSize = calculateBase64Size(image.data);
    }

    if (imageSize > 0) {
      totalSize += imageSize;
      validImageCount++;
    }
  }

  // If we couldn't determine any sizes, use conservative default
  if (validImageCount === 0) {
    console.warn('Could not determine image sizes, using default batch size of 5');
    return 5;
  }

  // Calculate average size in MB
  const avgSizeBytes = totalSize / validImageCount;
  const avgSizeMB = avgSizeBytes / (1024 * 1024);

  console.log(`📊 Image size analysis: ${validImageCount} images, avg size: ${avgSizeMB.toFixed(2)} MB`);

  // Determine optimal batch size based on average image size
  let batchSize: number;
  if (avgSizeMB < 5) {
    batchSize = 10;
  } else if (avgSizeMB < 10) {
    batchSize = 7;
  } else if (avgSizeMB < 20) {
    batchSize = 5;
  } else {
    batchSize = 3;
  }

  console.log(`✅ Calculated optimal batch size: ${batchSize} based on average image size of ${avgSizeMB.toFixed(2)} MB`);

  return batchSize;
};

/**
 * Create size-bounded batches of images to prevent exceeding API limits
 * 
 * This function creates batches based on actual cumulative size rather than
 * just image count. This prevents issues where a few large images could exceed
 * the API limit even with a low batch size.
 * 
 * Batch safety rules:
 * - Target max batch size: 200MB (safe buffer under 300MB limit)
 * - Minimum batch size: 1 image (handle edge case of single huge image)
 * - Maximum batch size: 15 images (prevent too many small images in one batch)
 * - Single image guard: Reject images >= 300MB (too large for API)
 * - Unknown-size images: Each gets its own batch (conservative safety approach)
 * 
 * Size calculation priority (CRITICAL for accurate batching):
 * 1. image.size metadata (from file upload, most accurate) 
 * 2. Storage lookup via fileId (backend only, requires storage adapter)
 * 3. Base64 calculation (calculateBase64Size for base64 data)
 * 4. NULL if size cannot be determined (triggers single-image batch for safety)
 * 
 * @param images - Array of images with fileId, base64 data, name, and optional size in bytes
 * @param maxBatchSizeMB - Maximum batch size in MB (default: 200MB for safety under 300MB limit)
 * @param storage - Optional storage instance to lookup file sizes (for backend use)
 * @returns Array of batches, where each batch is an array of images
 * @throws Error if any single image is >= 300MB (too large for API)
 */
export const createSizeBoundedBatches = async <T extends { fileId?: string; data?: string; name?: string; size?: number }>(
  images: T[],
  maxBatchSizeMB: number = 200,
  storage?: IStorage
): Promise<T[][]> => {
  if (images.length === 0) {
    return [];
  }

  const MAX_BATCH_SIZE_BYTES = maxBatchSizeMB * 1024 * 1024;
  const MAX_IMAGES_PER_BATCH = 15; // Prevent too many small images in one batch
  const MAX_SINGLE_IMAGE_MB = 300; // Maximum size for any single image (API limit)
  const MAX_SINGLE_IMAGE_BYTES = MAX_SINGLE_IMAGE_MB * 1024 * 1024;

  // First pass: determine sizes for all images
  type ImageWithDeterminedSize = { image: T; size: number | null };
  const imagesWithSizes: ImageWithDeterminedSize[] = [];
  
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    let imageSize: number | null = null;
    let sizeSource = '';

    // PRIORITY 1: Use size metadata if available (most accurate, from file upload)
    if (image.size && image.size > 0) {
      imageSize = image.size;
      sizeSource = 'metadata';
    }
    // PRIORITY 2: Try to get size from storage via fileId (backend only)
    else if (image.fileId && storage) {
      try {
        const fileData = await storage.getFile(image.fileId);
        if (fileData) {
          imageSize = fileData.file.bytes;
          sizeSource = 'storage lookup';
        }
      } catch (error) {
        console.warn(`⚠️ Failed to get file size for ${image.fileId}:`, error);
      }
    }

    // PRIORITY 3: Fallback to base64 calculation if no size metadata or storage lookup failed
    if (imageSize === null && image.data) {
      imageSize = calculateBase64Size(image.data);
      sizeSource = 'base64 calculation';
    }

    // If we still don't have a size, mark as null (unknown) - will be batched alone
    if (imageSize === null) {
      console.warn(`⚠️ Could not determine size for image ${i + 1} (${image.name || 'unknown'}). Will batch alone for safety.`);
    } else {
      const imageSizeMB = imageSize / (1024 * 1024);
      console.log(`📏 Image ${i + 1} (${image.name || 'unknown'}): ${imageSizeMB.toFixed(2)}MB (source: ${sizeSource})`);
      
      // CRITICAL: 300MB Single Image Guard
      if (imageSize >= MAX_SINGLE_IMAGE_BYTES) {
        const errorMsg = `Image "${image.name || 'unknown'}" is too large (${imageSizeMB.toFixed(2)}MB). Maximum allowed size is ${MAX_SINGLE_IMAGE_MB}MB per image.`;
        console.error(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }
    }

    imagesWithSizes.push({ image, size: imageSize });
  }

  // Separate known and unknown size images
  const knownSizeImages = imagesWithSizes.filter(item => item.size !== null);
  const unknownSizeImages = imagesWithSizes.filter(item => item.size === null);

  console.log(`📊 Image size breakdown: ${knownSizeImages.length} known-size, ${unknownSizeImages.length} unknown-size`);

  const batches: T[][] = [];

  // Batch known-size images normally (respecting 200MB limit)
  if (knownSizeImages.length > 0) {
    console.log(`📦 Creating size-bounded batches for ${knownSizeImages.length} known-size images (max ${maxBatchSizeMB}MB per batch, max ${MAX_IMAGES_PER_BATCH} images per batch)`);
    
    let currentBatch: T[] = [];
    let currentBatchSize = 0;

    for (const item of knownSizeImages) {
      const imageSize = item.size!; // We know it's not null here
      
      // Check if adding this image would exceed the batch size limit OR max images per batch
      if (currentBatch.length > 0 && 
          (currentBatchSize + imageSize > MAX_BATCH_SIZE_BYTES || 
           currentBatch.length >= MAX_IMAGES_PER_BATCH)) {
        // Close current batch and start a new one
        const batchSizeMB = currentBatchSize / (1024 * 1024);
        console.log(`✅ Batch ${batches.length + 1}: ${currentBatch.length} images, ${batchSizeMB.toFixed(2)}MB`);
        batches.push(currentBatch);
        currentBatch = [];
        currentBatchSize = 0;
      }

      // Add image to current batch
      currentBatch.push(item.image);
      currentBatchSize += imageSize;
    }

    // Add the last batch if it has any images
    if (currentBatch.length > 0) {
      const batchSizeMB = currentBatchSize / (1024 * 1024);
      console.log(`✅ Batch ${batches.length + 1}: ${currentBatch.length} images, ${batchSizeMB.toFixed(2)}MB`);
      batches.push(currentBatch);
    }
  }

  // Each unknown-size image gets its own batch (conservative approach)
  if (unknownSizeImages.length > 0) {
    console.log(`⚠️ Creating individual batches for ${unknownSizeImages.length} unknown-size images (safety measure)`);
    
    for (let i = 0; i < unknownSizeImages.length; i++) {
      const item = unknownSizeImages[i];
      console.log(`⚠️ Image ${i + 1}/${unknownSizeImages.length} (${item.image.name || 'unknown'}) has unknown size, batching alone for safety`);
      batches.push([item.image]);
    }
  }

  console.log(`📊 Created ${batches.length} batches from ${images.length} images (${knownSizeImages.length} known-size batched together, ${unknownSizeImages.length} unknown-size batched separately)`);

  return batches;
};
