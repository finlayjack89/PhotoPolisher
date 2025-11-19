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
 * NOTE: Replicate API requires base64 data URLs for image input.
 * Current implementation uses base64 which works reliably but has size overhead.
 */

import fetch from 'node-fetch';
import { fetchWithTimeout } from '../utils/fetch-utils';
import { calculateTimeout, getImageSizeFromBase64 } from '../utils/timeout-utils';

interface RemoveBackgroundRequest {
  images: Array<{
    data: string;
    name: string;
  }>;
}

// Timeout and retry configuration
const REPLICATE_REQUEST_TIMEOUT = 30000; // 30 seconds for initial request
const MAX_POLLING_TIME = 240000; // 4 minutes max polling time (accommodates 210s max bg-removal timeout with safety margin)
const INITIAL_POLL_DELAY = 1000; // Start with 1 second
const MAX_POLL_DELAY = 5000; // Max 5 seconds between polls

export async function removeBackgrounds(req: RemoveBackgroundRequest) {
  const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
  
  if (!REPLICATE_API_KEY) {
    console.error('❌ REPLICATE_API_KEY is not configured');
    throw new Error('REPLICATE_API_KEY is not configured. Please add your Replicate API key to continue.');
  }

  const { images } = req;
  console.log(`Processing ${images.length} images for background removal`);

  const processedImages = [];
  const batchStartTime = Date.now();

  for (const image of images) {
    try {
      console.log(`Removing background from: ${image.name}`);

      // Calculate timeout based on image size
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

      // Poll for completion with timeout and exponential backoff
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
        
        // Exponential backoff with max delay
        pollDelay = Math.min(pollDelay * 1.5, MAX_POLL_DELAY);
      }

      const predictionMs = Math.round(Date.now() - predictionStartTime);

      if (result.status === 'succeeded' && result.output) {
        // Defensively extract URL from Replicate output
        // Replicate can return: string URL, array of URLs, or nested objects
        let outputUrl: string | null = null;
        
        if (typeof result.output === 'string') {
          outputUrl = result.output;
        } else if (Array.isArray(result.output)) {
          if (result.output.length === 0) {
            throw new Error('Replicate returned empty output array');
          }
          // Find first string URL or extract URL from object entries
          for (const item of result.output) {
            if (typeof item === 'string') {
              outputUrl = item;
              break;
            } else if (item?.url) {
              outputUrl = item.url;
              break;
            } else if (item?.href) {
              outputUrl = item.href;
              break;
            } else if (item?.path) {
              outputUrl = item.path;
              break;
            }
          }
        } else if (result.output?.files && Array.isArray(result.output.files)) {
          // Find first string URL or extract URL from object entries
          for (const item of result.output.files) {
            if (typeof item === 'string') {
              outputUrl = item;
              break;
            } else if (item?.url) {
              outputUrl = item.url;
              break;
            } else if (item?.href) {
              outputUrl = item.href;
              break;
            } else if (item?.path) {
              outputUrl = item.path;
              break;
            }
          }
        } else if (result.output?.url) {
          outputUrl = result.output.url;
        }
        
        if (!outputUrl || typeof outputUrl !== 'string') {
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
      
      // Calculate size from the original base64 data
      // Remove data URL prefix if present (e.g., "data:image/png;base64,")
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

  const batchTotalMs = Math.round(Date.now() - batchStartTime);
  const successfulCount = processedImages.filter(img => !img.error).length;
  console.log(`⏱️ [PERF] Background removal batch: ${successfulCount} images in ${batchTotalMs}ms`);

  return {
    success: true,
    images: processedImages,
  };
}
