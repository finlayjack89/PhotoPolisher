import fetch from 'node-fetch';
import FormData from 'form-data';
import crypto from 'crypto';
import type { IStorage } from '../storage';
import { fetchWithTimeout, retryWithBackoff } from '../utils/fetch-utils';

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

    // Use timeout and retry logic for preview upload
    const uploadResponse = await retryWithBackoff(
      () => fetchWithTimeout(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: 'POST',
          body: uploadData,
        },
        30000
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

  const processedImages = [];

  for (let i = 0; i < imagesToProcess.length; i++) {
    const img = imagesToProcess[i];
    console.log(`Processing image ${i + 1}/${imagesToProcess.length}: ${img.name}`);

    try {
      // Skip if no data (file not found)
      if (!img.data) {
        processedImages.push({
          name: img.name,
          shadowedData: '',
          shadowedFileId: undefined,
          error: 'File not found in storage',
        });
        continue;
      }

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

      // Use timeout and retry logic for image upload
      const uploadResponse = await retryWithBackoff(
        () => fetchWithTimeout(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          {
            method: 'POST',
            body: uploadData,
          },
          30000
        )
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(`Upload failed for ${img.name}:`, errorText);
        throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
      }

      const uploadResult = await uploadResponse.json() as any;
      console.log(`✅ Uploaded ${img.name} to Cloudinary:`, uploadResult.public_id);

      const paddingMultiplier = Math.max(1.5, 1 + (spread / 100));
      console.log(`Using padding multiplier: ${paddingMultiplier}x for spread: ${spread}`);

      // --- MODIFIED LINE ---
      // Added opacity (co_rgb:000,o_OPACITY) to the drop shadow effect
      const transformedUrl = `https://res.cloudinary.com/${cloudName}/image/upload/c_lpad,w_iw_mul_${paddingMultiplier},h_ih_mul_${paddingMultiplier},b_transparent/e_dropshadow:azimuth_${azimuth};elevation_${elevation};spread_${spread},co_rgb:000,o_${opacity}/${uploadResult.public_id}.png`;
      // --- END MODIFIED LINE ---

      console.log(`Transformation URL: ${transformedUrl}`);

      // Use timeout and retry logic for transformed image fetch
      const transformedResponse = await retryWithBackoff(
        () => fetchWithTimeout(transformedUrl, {}, 30000)
      );

      if (!transformedResponse.ok) {
        throw new Error(`Failed to fetch transformed image: ${transformedResponse.status}`);
      }

      const transformedBuffer = await transformedResponse.arrayBuffer();
      const base64 = Buffer.from(transformedBuffer).toString('base64');

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

      processedImages.push({
        name: img.name,
        shadowedData: shadowedDataUrl,
        shadowedFileId,
      });

      console.log(`✅ Successfully added shadow to ${img.name}`);

      // Cleanup
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
        const deleteResponse = await fetchWithTimeout(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
          {
            method: 'POST',
            body: deleteData,
          },
          30000
        );

        if (deleteResponse.ok) {
          console.log(`🗑️ Cleaned up temporary Cloudinary image: ${uploadResult.public_id}`);
        }
      } catch (cleanupError) {
        console.warn('Failed to cleanup Cloudinary image:', cleanupError);
      }

    } catch (imageError) {
      console.error(`Failed to process ${img.name}:`, imageError);
      processedImages.push({
        name: img.name,
        shadowedData: img.data,
        shadowedFileId: undefined,
        error: imageError instanceof Error ? imageError.message : 'Unknown error',
      });
    }
  }

  return {
    success: true,
    images: processedImages
  };
}