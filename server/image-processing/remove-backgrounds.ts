/**
 * Background Removal using Replicate API
 * 
 * Model: 851-labs/background-remover (InSPyReNet - ACCV 2022)
 * - 10.3M+ runs, battle-tested for production use
 * - ~2 seconds processing time on Nvidia T4 GPU
 * - ~$0.00039 per run (~2,564 runs per $1)
 * - Cleaner edges and fewer artifacts than previous models
 * 
 * Configuration:
 * - threshold: 0.8 (hard segmentation for sharp edges)
 * 
 * REFACTORED: Now accepts URLs directly instead of base64 data.
 * This prevents event loop blocking during large file transfers.
 * Replicate API natively supports HTTP URLs for image input.
 */

import fetch from 'node-fetch';
import { fetchWithTimeout } from '../utils/fetch-utils';
import { calculateTimeout, getImageSizeFromBase64 } from '../utils/timeout-utils';
import type { IStorage } from '../storage';

interface RemoveBackgroundRequest {
  /** Legacy base64 data approach - deprecated but still supported */
  images?: Array<{
    data: string;
    name: string;
  }>;
  /** New URL-based approach - preferred */
  urls?: Array<{
    url: string;
    name: string;
    fileId?: string;
    sizeBytes?: number;
  }>;
}

const REPLICATE_REQUEST_TIMEOUT = 30000;
const MAX_POLLING_TIME = 240000;
const INITIAL_POLL_DELAY = 1000;
const MAX_POLL_DELAY = 5000;

interface ProcessedImage {
  name: string;
  transparentData?: string;
  resultUrl?: string;
  size: number;
  error?: string;
}

export async function removeBackgrounds(req: RemoveBackgroundRequest, storage?: IStorage): Promise<{
  success: boolean;
  images: ProcessedImage[];
}> {
  const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
  
  if (!REPLICATE_API_KEY) {
    console.error('❌ REPLICATE_API_KEY is not configured');
    throw new Error('REPLICATE_API_KEY is not configured. Please add your Replicate API key to continue.');
  }

  const processedImages: ProcessedImage[] = [];
  const batchStartTime = Date.now();

  // Process URL-based requests (preferred - non-blocking)
  if (req.urls && req.urls.length > 0) {
    console.log(`🚀 [URL Mode] Processing ${req.urls.length} images via URL for background removal`);
    
    for (const imageInfo of req.urls) {
      try {
        console.log(`Removing background from: ${imageInfo.name} (URL: ${imageInfo.url})`);
        
        const imageSize = imageInfo.sizeBytes || 5 * 1024 * 1024; // Default 5MB if unknown
        const bgRemovalTimeout = calculateTimeout('bg-removal', imageSize);

        const imageStartTime = Date.now();
        const predictionStartTime = Date.now();
        
        // Replicate accepts URLs directly - no base64 conversion needed!
        const response = await fetchWithTimeout(
          'https://api.replicate.com/v1/predictions',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${REPLICATE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              version: 'a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc',
              input: {
                image: imageInfo.url, // Pass URL directly!
                threshold: 0.8,
              }
            }),
          },
          bgRemovalTimeout,
          `Replicate prediction start: ${imageInfo.name}`
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Replicate API error for ${imageInfo.name}:`, errorText);
          throw new Error(`Replicate API error: ${response.status}`);
        }

        const prediction = await response.json() as any;
        console.log(`Prediction started for ${imageInfo.name}:`, prediction.id);

        // Poll for completion
        let result = prediction;
        const startTime = Date.now();
        let pollDelay = INITIAL_POLL_DELAY;
        let pollCount = 0;

        while (result.status === 'starting' || result.status === 'processing') {
          const elapsedTime = Date.now() - startTime;
          
          if (elapsedTime > MAX_POLLING_TIME) {
            throw new Error(`Timeout: Background removal took longer than ${MAX_POLLING_TIME / 1000} seconds`);
          }
          
          await new Promise(resolve => setTimeout(resolve, pollDelay));
          pollCount++;
          
          const statusResponse = await fetchWithTimeout(
            `https://api.replicate.com/v1/predictions/${prediction.id}`,
            {
              headers: {
                'Authorization': `Bearer ${REPLICATE_API_KEY}`,
              },
            },
            bgRemovalTimeout,
            `Replicate status poll: ${imageInfo.name}`
          );
          
          result = await statusResponse.json() as any;
          console.log(`Status for ${imageInfo.name} (poll #${pollCount}, ${Math.round(elapsedTime / 1000)}s elapsed):`, result.status);
          
          pollDelay = Math.min(pollDelay * 1.5, MAX_POLL_DELAY);
        }

        const predictionMs = Math.round(Date.now() - predictionStartTime);

        if (result.status === 'succeeded' && result.output) {
          const outputUrl = extractOutputUrl(result.output);
          
          if (!outputUrl) {
            console.error('Unexpected Replicate output structure:', JSON.stringify(result.output));
            throw new Error('Could not extract valid URL from Replicate output');
          }
          
          // If storage is provided, download and store the result
          if (storage) {
            const downloadStartTime = Date.now();
            const downloadTimeout = calculateTimeout('download');
            const imageResponse = await fetchWithTimeout(outputUrl, {}, downloadTimeout, `Download result: ${imageInfo.name}`);
            const imageBuffer = await imageResponse.arrayBuffer();
            const buffer = Buffer.from(imageBuffer);
            const downloadMs = Math.round(Date.now() - downloadStartTime);
            
            // Store processed file
            const processedFile = await storage.createFile(
              {
                storageKey: `processed/background-removed/${Date.now()}-${imageInfo.name}`,
                mimeType: 'image/png',
                bytes: buffer.length,
                originalFilename: `bg-removed-${imageInfo.name}`,
              },
              buffer
            );
            
            processedImages.push({
              name: imageInfo.name,
              resultUrl: `/api/files/${processedFile.id}`,
              size: buffer.length,
            });
            
            const totalImageMs = Math.round(Date.now() - imageStartTime);
            console.log(`✅ Successfully removed background from ${imageInfo.name} (${buffer.length} bytes)`);
            console.log(`⏱️ [PERF] Background removal: ${imageInfo.name} took ${totalImageMs}ms (prediction: ${predictionMs}ms, download: ${downloadMs}ms)`);
          } else {
            // No storage - return the Replicate URL directly
            processedImages.push({
              name: imageInfo.name,
              resultUrl: outputUrl,
              size: 0,
            });
            
            console.log(`✅ Successfully removed background from ${imageInfo.name} (URL returned)`);
          }
        } else {
          throw new Error(`Background removal failed: ${result.status}`);
        }

      } catch (error) {
        console.error(`Error processing ${imageInfo.name}:`, error);
        processedImages.push({
          name: imageInfo.name,
          size: imageInfo.sizeBytes || 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  // Legacy: Process base64 data (for backward compatibility)
  if (req.images && req.images.length > 0) {
    console.log(`⚠️ [Legacy Mode] Processing ${req.images.length} images via base64 for background removal`);
    
    for (const image of req.images) {
      try {
        console.log(`Removing background from: ${image.name}`);

        const imageSize = getImageSizeFromBase64(image.data);
        const bgRemovalTimeout = calculateTimeout('bg-removal', imageSize);

        const imageStartTime = Date.now();
        const predictionStartTime = Date.now();
        const response = await fetchWithTimeout(
          'https://api.replicate.com/v1/predictions',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${REPLICATE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              version: 'a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc',
              input: {
                image: image.data,
                threshold: 0.8,
              }
            }),
          },
          bgRemovalTimeout,
          `Replicate prediction start: ${image.name}`
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Replicate API error for ${image.name}:`, errorText);
          throw new Error(`Replicate API error: ${response.status}`);
        }

        const prediction = await response.json() as any;
        console.log(`Prediction started for ${image.name}:`, prediction.id);

        let result = prediction;
        const startTime = Date.now();
        let pollDelay = INITIAL_POLL_DELAY;
        let pollCount = 0;

        while (result.status === 'starting' || result.status === 'processing') {
          const elapsedTime = Date.now() - startTime;
          
          if (elapsedTime > MAX_POLLING_TIME) {
            throw new Error(`Timeout: Background removal took longer than ${MAX_POLLING_TIME / 1000} seconds`);
          }
          
          await new Promise(resolve => setTimeout(resolve, pollDelay));
          pollCount++;
          
          const statusResponse = await fetchWithTimeout(
            `https://api.replicate.com/v1/predictions/${prediction.id}`,
            {
              headers: {
                'Authorization': `Bearer ${REPLICATE_API_KEY}`,
              },
            },
            bgRemovalTimeout,
            `Replicate status poll: ${image.name}`
          );
          
          result = await statusResponse.json() as any;
          console.log(`Status for ${image.name} (poll #${pollCount}, ${Math.round(elapsedTime / 1000)}s elapsed):`, result.status);
          
          pollDelay = Math.min(pollDelay * 1.5, MAX_POLL_DELAY);
        }

        const predictionMs = Math.round(Date.now() - predictionStartTime);

        if (result.status === 'succeeded' && result.output) {
          const outputUrl = extractOutputUrl(result.output);
          
          if (!outputUrl) {
            console.error('Unexpected Replicate output structure:', JSON.stringify(result.output));
            throw new Error('Could not extract valid URL from Replicate output');
          }
          
          const downloadStartTime = Date.now();
          const downloadTimeout = calculateTimeout('download');
          const imageResponse = await fetchWithTimeout(outputUrl, {}, downloadTimeout, `Download result: ${image.name}`);
          const imageBuffer = await imageResponse.arrayBuffer();
          const base64 = Buffer.from(imageBuffer).toString('base64');
          const transparentDataUrl = `data:image/png;base64,${base64}`;
          const downloadMs = Math.round(Date.now() - downloadStartTime);
          
          processedImages.push({
            name: image.name,
            transparentData: transparentDataUrl,
            size: imageBuffer.byteLength,
          });
          
          const totalImageMs = Math.round(Date.now() - imageStartTime);
          console.log(`✅ Successfully removed background from ${image.name} (${imageBuffer.byteLength} bytes)`);
          console.log(`⏱️ [PERF] Background removal: ${image.name} took ${totalImageMs}ms (prediction: ${predictionMs}ms, download: ${downloadMs}ms)`);
        } else {
          throw new Error(`Background removal failed: ${result.status}`);
        }

      } catch (error) {
        console.error(`Error processing ${image.name}:`, error);
        
        const base64String = image.data.includes(',') ? image.data.split(',')[1] : image.data;
        const estimatedBytes = Math.ceil((base64String.length * 3) / 4);
        
        processedImages.push({
          name: image.name,
          transparentData: image.data,
          size: estimatedBytes,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  const batchTotalMs = Math.round(Date.now() - batchStartTime);
  const successfulCount = processedImages.filter(img => !img.error).length;
  console.log(`⏱️ [PERF] Background removal batch: ${successfulCount} images in ${batchTotalMs}ms`);

  return {
    success: true,
    images: processedImages,
  };
}

/**
 * Extract URL from various Replicate output formats
 */
function extractOutputUrl(output: any): string | null {
  if (typeof output === 'string') {
    return output;
  }
  
  if (Array.isArray(output)) {
    if (output.length === 0) return null;
    for (const item of output) {
      if (typeof item === 'string') return item;
      if (item?.url) return item.url;
      if (item?.href) return item.href;
      if (item?.path) return item.path;
    }
  }
  
  if (output?.files && Array.isArray(output.files)) {
    for (const item of output.files) {
      if (typeof item === 'string') return item;
      if (item?.url) return item.url;
      if (item?.href) return item.href;
      if (item?.path) return item.path;
    }
  }
  
  if (output?.url) return output.url;
  
  return null;
}

