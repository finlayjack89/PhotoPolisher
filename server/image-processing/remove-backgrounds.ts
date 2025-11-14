/**
 * Background Removal using Replicate API
 * 
 * NOTE: Replicate API requires base64 data URLs for image input.
 * The API does not support binary uploads or external URLs for this model.
 * This is a limitation of the specific model (BRIA RMBG 1.4) being used.
 * 
 * Optimization opportunity: Future investigation could explore:
 * - Alternative Replicate models that support URL input
 * - Direct binary upload if supported in newer API versions
 * - Switching to a different background removal service
 * 
 * Current implementation uses base64 which works reliably but has size overhead.
 */

import fetch from 'node-fetch';

interface RemoveBackgroundRequest {
  images: Array<{
    data: string;
    name: string;
  }>;
}

// Timeout and retry configuration
const REPLICATE_REQUEST_TIMEOUT = 30000; // 30 seconds for initial request
const MAX_POLLING_TIME = 120000; // 2 minutes max polling time
const INITIAL_POLL_DELAY = 1000; // Start with 1 second
const MAX_POLL_DELAY = 5000; // Max 5 seconds between polls

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, options: any, timeout: number): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

export async function removeBackgrounds(req: RemoveBackgroundRequest) {
  const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
  
  if (!REPLICATE_API_KEY) {
    console.error('❌ REPLICATE_API_KEY is not configured');
    throw new Error('REPLICATE_API_KEY is not configured. Please add your Replicate API key to continue.');
  }

  const { images } = req;
  console.log(`Processing ${images.length} images for background removal`);

  const processedImages = [];

  for (const image of images) {
    try {
      console.log(`Removing background from: ${image.name}`);

      const response = await fetchWithTimeout(
        'https://api.replicate.com/v1/predictions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${REPLICATE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            version: 'fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',
            input: {
              image: image.data,
            }
          }),
        },
        REPLICATE_REQUEST_TIMEOUT
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
          REPLICATE_REQUEST_TIMEOUT
        );
        
        result = await statusResponse.json() as any;
        console.log(`Status for ${image.name} (poll #${pollCount}, ${Math.round(elapsedTime / 1000)}s elapsed):`, result.status);
        
        // Exponential backoff with max delay
        pollDelay = Math.min(pollDelay * 1.5, MAX_POLL_DELAY);
      }

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
        
        const imageResponse = await fetch(outputUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(imageBuffer).toString('base64');
        const transparentDataUrl = `data:image/png;base64,${base64}`;
        
        processedImages.push({
          name: image.name,
          transparentData: transparentDataUrl,
          size: imageBuffer.byteLength,
        });
        
        console.log(`✅ Successfully removed background from ${image.name} (${imageBuffer.byteLength} bytes)`);
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

  return {
    success: true,
    images: processedImages,
  };
}
