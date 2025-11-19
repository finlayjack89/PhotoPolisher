import fetch from 'node-fetch';
import FormData from 'form-data';
import crypto from 'crypto';
import type { IStorage } from '../storage';
import { fetchWithTimeout, retryWithBackoff } from '../utils/fetch-utils';
import { calculateTimeout, getImageSizeFromBase64 } from '../utils/timeout-utils';
import { processQueue } from '../utils/queue-utils';

export interface AddDropShadowRequest {
  images?: Array<{
    data: string;
    name: string;
  }>;
  fileIds?: Array<{
    fileId: string;
    name: string;
  }>;
  uploadPreview?: boolean;
  image?: { data: string };
  azimuth?: number;
  elevation?: number;
  spread?: number;
  opacity?: number;
}

async function generateSignature(stringToSign: string, apiSecret: string): Promise<string> {
  return crypto.createHash('sha1').update(stringToSign).digest('hex');
}

export async function addDropShadow(req: AddDropShadowRequest, storage?: IStorage) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials not configured');
  }

  const { images, fileIds, uploadPreview, image, azimuth = 0, elevation = 90, spread = 5, opacity = 75 } = req; // <-- ADDED opacity

  // Handle preview upload
  if (uploadPreview && image) {
    console.log('Uploading preview image to Cloudinary...');

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'shadow_preview_temp';
    const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const uploadSignature = await generateSignature(signatureString, apiSecret);

    const uploadData = new FormData();
    uploadData.append('file', image.data);
    uploadData.append('api_key', apiKey);
    uploadData.append('timestamp', timestamp.toString());
    uploadData.append('signature', uploadSignature);
    uploadData.append('folder', folder);

    // Calculate timeout based on image size
    const previewImageSize = getImageSizeFromBase64(image.data);
    const uploadTimeout = calculateTimeout('upload', previewImageSize);

    // Use timeout and retry logic for preview upload
    const uploadResponse = await retryWithBackoff(
      () => fetchWithTimeout(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: 'POST',
          body: uploadData,
        },
        uploadTimeout
      )
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Preview upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const uploadResult = await uploadResponse.json() as any;
    console.log('✅ Preview uploaded:', uploadResult.public_id);

    return {
      success: true,
      publicId: uploadResult.public_id,
      cloudName: cloudName
    };
  }

  // Convert fileIds to images array if provided
  let imagesToProcess: Array<{ data: string; name: string }> = [];
  
  if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
    if (!storage) {
      throw new Error('Storage instance required when using fileIds');
    }
    
    console.log(`📁 Loading ${fileIds.length} images from storage by fileId...`);
    
    for (const { fileId, name } of fileIds) {
      try {
        const fileData = await storage.getFile(fileId);
        
        if (!fileData) {
          console.error(`File not found for fileId: ${fileId}`);
          imagesToProcess.push({
            data: '',
            name: name || 'unknown',
          });
          continue;
        }
        
        const base64Data = `data:${fileData.file.mimeType};base64,${fileData.buffer.toString('base64')}`;
        imagesToProcess.push({
          data: base64Data,
          name: name || fileData.file.originalFilename || 'image',
        });
        
        console.log(`✅ Loaded ${name} from storage (${fileData.buffer.length} bytes)`);
      } catch (error) {
        console.error(`Failed to load file ${fileId}:`, error);
        imagesToProcess.push({
          data: '',
          name: name || 'unknown',
        });
      }
    }
  } else if (images && Array.isArray(images) && images.length > 0) {
    // Fallback to legacy base64 data approach
    imagesToProcess = images;
  } else {
    throw new Error('No images or fileIds provided');
  }

  const MAX_BATCH_SIZE = 300 * 1024 * 1024;
  let totalBatchSize = 0;
  
  for (const img of imagesToProcess) {
    if (img.data) {
      // Normalize base64 string: strip data URL prefix and whitespace before calculating
      const base64Data = img.data.replace(/^data:image\/[a-z]+;base64,/, '').replace(/\s/g, '');
      // Base64 is ~33% larger than actual binary, so multiply by 0.75 to get actual size
      const estimatedSize = base64Data.length * 0.75;
      totalBatchSize += estimatedSize;
    }
  }
  
  const totalSizeMB = (totalBatchSize / (1024 * 1024)).toFixed(2);
  console.log(`Processing shadow batch: ${imagesToProcess.length} images, ${totalSizeMB} MB total`);
  
  if (totalBatchSize > MAX_BATCH_SIZE) {
    throw new Error(`Total batch size: ${totalSizeMB} MB exceeds 300MB limit. Please process images in smaller batches.`);
  }

  console.log(`Processing ${imagesToProcess.length} images for drop shadow with params: azimuth=${azimuth}, elevation=${elevation}, spread=${spread}, opacity=${opacity}`);
  console.log(`Using queue with max 3 concurrent Cloudinary requests`);

  const batchStartTime = Date.now();

  // Process images with controlled concurrency
  const processedImages = await processQueue(
    imagesToProcess,
    async (img, index) => {
      try {
        // Skip if no data (file not found)
        if (!img.data) {
          return {
            name: img.name,
            shadowedData: '',
            shadowedFileId: undefined,
            error: 'File not found in storage',
          };
        }

        const imageStartTime = Date.now();
        const timestamp = Math.floor(Date.now() / 1000);
        const folder = 'drop_shadow_temp';
        const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
        const uploadSignature = await generateSignature(signatureString, apiSecret);

        const uploadData = new FormData();
        uploadData.append('file', img.data);
        uploadData.append('api_key', apiKey);
        uploadData.append('timestamp', timestamp.toString());
        uploadData.append('signature', uploadSignature);
        uploadData.append('folder', folder);

        console.log(`Uploading ${img.name} to Cloudinary with signed upload...`);

        // Calculate timeout based on image size
        const imageSize = getImageSizeFromBase64(img.data);
        const uploadTimeout = calculateTimeout('upload', imageSize);

        const uploadStartTime = Date.now();
        // Use timeout and retry logic for image upload
        const uploadResponse = await retryWithBackoff(
          () => fetchWithTimeout(
            `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
            {
              method: 'POST',
              body: uploadData,
            },
            uploadTimeout,
            `Cloudinary upload: ${img.name}`
          )
        );
        const uploadMs = Math.round(Date.now() - uploadStartTime);

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error(`Upload failed for ${img.name}:`, errorText);
          throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
        }

        const uploadResult = await uploadResponse.json() as any;
        console.log(`✅ Uploaded ${img.name} to Cloudinary:`, uploadResult.public_id);

        const paddingMultiplier = Math.max(1.5, 1 + (spread / 100));
        console.log(`Using padding multiplier: ${paddingMultiplier}x for spread: ${spread}`);

        // Added opacity (co_rgb:000,o_OPACITY) to the drop shadow effect
        const transformedUrl = `https://res.cloudinary.com/${cloudName}/image/upload/c_lpad,w_iw_mul_${paddingMultiplier},h_ih_mul_${paddingMultiplier},b_transparent/e_dropshadow:azimuth_${azimuth};elevation_${elevation};spread_${spread},co_rgb:000,o_${opacity}/${uploadResult.public_id}.png`;

        console.log(`Transformation URL: ${transformedUrl}`);

        // Calculate timeout for shadow transformation (reuse imageSize from upload)
        const shadowTimeout = calculateTimeout('shadow', imageSize);

        const transformStartTime = Date.now();
        // Use timeout and retry logic for transformed image fetch
        const transformedResponse = await retryWithBackoff(
          () => fetchWithTimeout(transformedUrl, {}, shadowTimeout, `Cloudinary transform: ${img.name}`)
        );

        if (!transformedResponse.ok) {
          throw new Error(`Failed to fetch transformed image: ${transformedResponse.status}`);
        }

        const transformedBuffer = await transformedResponse.arrayBuffer();
        const base64 = Buffer.from(transformedBuffer).toString('base64');
        const transformMs = Math.round(Date.now() - transformStartTime);

        const shadowedDataUrl = `data:image/png;base64,${base64}`;

        // Store shadowedData as file for file ID architecture (Phase 1 optimization)
        let shadowedFileId: string | undefined;
        if (storage) {
          try {
            const buffer = Buffer.from(transformedBuffer);
            const shadowedFile = await storage.createFile(
              {
                storageKey: `shadows/${Date.now()}-${img.name}`,
                mimeType: 'image/png',
                bytes: buffer.length,
                originalFilename: `shadow-${img.name}`,
              },
              buffer
            );
            shadowedFileId = shadowedFile.id;
            console.log(`💾 Stored shadow as file: ${shadowedFileId} (${buffer.length} bytes)`);
          } catch (storageError) {
            console.warn(`Failed to store shadow as file for ${img.name}:`, storageError);
          }
        }

        console.log(`✅ Successfully added shadow to ${img.name}`);

        // Cleanup
        const cleanupStartTime = Date.now();
        let cleanupMs = 0;
        try {
          const deleteTimestamp = Math.floor(Date.now() / 1000);
          const deleteSignatureString = `public_id=${uploadResult.public_id}&timestamp=${deleteTimestamp}${apiSecret}`;
          const deleteSignature = await generateSignature(deleteSignatureString, apiSecret);

          const deleteData = new FormData();
          deleteData.append('public_id', uploadResult.public_id);
          deleteData.append('signature', deleteSignature);
          deleteData.append('api_key', apiKey);
          deleteData.append('timestamp', deleteTimestamp.toString());

          // Use timeout for cleanup (no retry needed for cleanup)
          const cleanupTimeout = calculateTimeout('download');
          const deleteResponse = await fetchWithTimeout(
            `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
            {
              method: 'POST',
              body: deleteData,
            },
            cleanupTimeout,
            `Cloudinary cleanup: ${img.name}`
          );

          if (deleteResponse.ok) {
            console.log(`🗑️ Cleaned up temporary Cloudinary image: ${uploadResult.public_id}`);
          }
          cleanupMs = Math.round(Date.now() - cleanupStartTime);
        } catch (cleanupError) {
          console.warn('Failed to cleanup Cloudinary image:', cleanupError);
          cleanupMs = Math.round(Date.now() - cleanupStartTime);
        }

        const totalImageMs = Math.round(Date.now() - imageStartTime);
        console.log(`⏱️ [PERF] Shadow generation: ${img.name} took ${totalImageMs}ms (upload: ${uploadMs}ms, transform: ${transformMs}ms, cleanup: ${cleanupMs}ms)`);

        return {
          name: img.name,
          shadowedData: shadowedDataUrl,
          shadowedFileId,
        };
      } catch (imageError) {
        console.error(`Failed to process ${img.name}:`, imageError);
        return {
          name: img.name,
          shadowedData: img.data,
          shadowedFileId: undefined,
          error: imageError instanceof Error ? imageError.message : 'Unknown error',
        };
      }
    },
    {
      concurrency: 3,
      onProgress: (completed, total, active) => {
        console.log(`Shadow generation: [${completed}/${total}] images processed (${active} active requests)`);
      }
    }
  );

  const batchTotalMs = Math.round(Date.now() - batchStartTime);
  const successfulCount = processedImages.filter(img => !img.error).length;
  const avgMs = successfulCount > 0 ? Math.round(batchTotalMs / successfulCount) : 0;
  console.log(`⏱️ [PERF] Shadow batch complete: ${successfulCount} images in ${batchTotalMs}ms (avg ${avgMs}ms per image)`);

  return {
    success: true,
    images: processedImages
  };
}