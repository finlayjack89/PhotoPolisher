/**
 * DEPRECATED: TinyPNG Server-Side Compression
 * 
 * This endpoint is deprecated and commented out as of Phase 1 stabilization.
 * Client-side compression is already handling image optimization before upload,
 * making this redundant server-side compression unnecessary.
 * 
 * Removing this eliminates:
 * - Redundant API calls to TinyPNG
 * - Server-side processing overhead
 * - Potential timeout issues from double compression
 * 
 * If needed in the future, uncomment the endpoint in server/routes.ts
 */

import fetch from 'node-fetch';

interface CompressImagesRequest {
  files: Array<{
    data: string;
    name: string;
    originalName?: string;
    format?: string;
    size?: number;
  }>;
}

export async function compressImages(req: CompressImagesRequest) {
  const TINIFY_API_KEY = process.env.TINIFY_API_KEY;
  
  if (!TINIFY_API_KEY) {
    throw new Error('TINIFY_API_KEY is not configured');
  }

  const { files } = req;
  console.log(`Processing ${files.length} images for intelligent compression`);

  const compressedFiles = [];
  const TARGET_SIZE_MB = 5;
  const TARGET_SIZE_BYTES = TARGET_SIZE_MB * 1024 * 1024;

  for (const file of files) {
    const fileName = file.originalName || file.name;
    console.log(`Analyzing image: ${fileName}`);
    
    try {
      const base64Data = file.data.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const originalSize = imageBuffer.length;
      
      console.log(`Original size: ${fileName} - ${(originalSize / (1024 * 1024)).toFixed(2)}MB`);
      
      if (originalSize <= TARGET_SIZE_BYTES) {
        console.log(`Skipping compression for ${fileName} - already under ${TARGET_SIZE_MB}MB`);
        compressedFiles.push({
          originalName: fileName,
          processedName: fileName,
          data: file.data,
          size: originalSize,
          format: file.format || 'png',
          compressionRatio: 'No compression needed'
        });
        continue;
      }

      console.log(`Compressing ${fileName} using gradual quality reduction to reach ~${TARGET_SIZE_MB}MB`);
      
      let bestResult = null;
      let bestSize = originalSize;
      let currentQuality = 95;

      const initialResponse = await fetch('https://api.tinify.com/shrink', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`api:${TINIFY_API_KEY}`).toString('base64')}`,
          'Content-Type': 'application/octet-stream',
        },
        body: imageBuffer,
      });

      if (initialResponse.ok) {
        const initialResult = await initialResponse.json() as any;
        const initialCompressed = await fetch(initialResult.output.url);
        const initialBuffer = await initialCompressed.arrayBuffer();
        const initialSize = initialBuffer.byteLength;
        
        console.log(`Initial compression: ${(initialSize / (1024 * 1024)).toFixed(2)}MB`);
        
        if (initialSize <= TARGET_SIZE_BYTES) {
          bestResult = initialBuffer;
          bestSize = initialSize;
          console.log(`Basic compression sufficient for ${fileName}`);
        } else {
          while (currentQuality >= 70 && bestSize > TARGET_SIZE_BYTES) {
            try {
              const qualityResponse = await fetch(initialResult.output.url, {
                method: 'POST',
                headers: {
                  'Authorization': `Basic ${Buffer.from(`api:${TINIFY_API_KEY}`).toString('base64')}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  convert: {
                    type: 'image/jpeg',
                    quality: Math.round(currentQuality)
                  }
                }),
              });
              
              if (qualityResponse.ok) {
                const qualityResult = await qualityResponse.json() as any;
                const compressedResponse = await fetch(qualityResult.output.url);
                const compressedBuffer = await compressedResponse.arrayBuffer();
                const compressedSize = compressedBuffer.byteLength;
                
                console.log(`Quality ${currentQuality}%: ${(compressedSize / (1024 * 1024)).toFixed(2)}MB`);
                
                if (compressedSize <= TARGET_SIZE_BYTES) {
                  bestResult = compressedBuffer;
                  bestSize = compressedSize;
                  console.log(`Target achieved at quality ${currentQuality}%`);
                  break;
                }
              }
              
              currentQuality -= 3;
            } catch (error) {
              console.error(`Error at quality ${currentQuality}%:`, error);
              break;
            }
          }
        }
      }
      
      if (bestResult) {
        const compressedBase64 = Buffer.from(bestResult).toString('base64');
        const compressionRatio = Math.round((1 - bestSize / originalSize) * 100);
        
        compressedFiles.push({
          originalName: fileName,
          processedName: `compressed_${fileName}`,
          data: compressedBase64,
          size: bestSize,
          format: file.format || 'png',
          compressionRatio: `${compressionRatio}% smaller`
        });

        console.log(`✅ Successfully compressed: ${fileName} (${(bestSize / (1024 * 1024)).toFixed(2)}MB, ${compressionRatio}% reduction)`);
      } else {
        compressedFiles.push({
          originalName: fileName,
          processedName: fileName,
          data: file.data,
          size: originalSize,
          format: file.format || 'png',
          compressionRatio: 'Compression failed'
        });
      }
    } catch (error) {
      console.error(`Error processing ${fileName}:`, error);
      compressedFiles.push({
        originalName: fileName,
        processedName: fileName,
        data: file.data,
        size: file.size || 0,
        format: file.format || 'png',
        compressionRatio: 'Processing failed'
      });
    }
  }

  return {
    success: true,
    compressedFiles
  };
}
