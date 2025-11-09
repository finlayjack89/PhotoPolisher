/**
 * Utility functions for resizing images to prevent Edge Function memory issues
 */

/**
 * Get image dimensions from a File
 */
export const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File is not an image'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Process and compress images only if they exceed 5MB
 * Images under 5MB are returned as-is without any processing
 * Images over 5MB are compressed to 4.5-5MB range using dimension-based compression for PNG
 */
export const processAndCompressImage = (file: File, originalFileSize?: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const originalSize = originalFileSize || file.size;
    const SIZE_5MB = 5 * 1024 * 1024;
    const SIZE_4_5MB = 4.5 * 1024 * 1024;
    
    // If file is under 5MB, return as-is without any processing
    if (originalSize <= SIZE_5MB) {
      return resolve(file);
    }
    
    // Only process files over 5MB
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to get canvas context'));
        }
        
        // Use natural dimensions (EXIF orientation already corrected at upload)
        let currentWidth = img.naturalWidth;
        let currentHeight = img.naturalHeight;
        
        // Ensure max dimension is 2048 but preserve aspect ratio
        const maxDimension = 2048;
        if (currentWidth > maxDimension || currentHeight > maxDimension) {
          if (currentWidth > currentHeight) {
            currentHeight = Math.round((currentHeight * maxDimension) / currentWidth);
            currentWidth = maxDimension;
          } else {
            currentWidth = Math.round((currentWidth * maxDimension) / currentHeight);
            currentHeight = maxDimension;
          }
        }
        
        console.log(`Starting compression: ${currentWidth}x${currentHeight}`);
        
        const compressLoop = async () => {
          let bestBlob: Blob | null = null;
          let lastBlob: Blob | null = null;
          let iterations = 0;
          const maxIterations = 25; // Prevent infinite loop
          
          // Try progressive dimension reduction (2% each step) until we hit target size
          while (iterations < maxIterations) {
            canvas.width = currentWidth;
            canvas.height = currentHeight;
            ctx.clearRect(0, 0, currentWidth, currentHeight);
            ctx.drawImage(img, 0, 0, currentWidth, currentHeight);
            
            // Create PNG blob
            const compressedBlob: Blob = await new Promise((res) => {
              canvas.toBlob(
                (b) => res(b as Blob),
                'image/png',
                1.0 // PNG ignores quality but we set to 1.0 for clarity
              );
            });
            
            lastBlob = compressedBlob; // Keep track of the last blob
            
            console.log(`Iteration ${iterations + 1}: ${currentWidth}x${currentHeight}, Size: ${(compressedBlob.size / (1024 * 1024)).toFixed(2)}MB`);
            
            // Check if we're in the target range (4.5MB - 5MB)
            if (compressedBlob.size >= SIZE_4_5MB && compressedBlob.size <= SIZE_5MB) {
              console.log(`Target reached: ${(compressedBlob.size / (1024 * 1024)).toFixed(2)}MB`);
              return resolve(compressedBlob);
            }
            
            // If we've compressed below 4.5MB, use the previous iteration if available
            if (compressedBlob.size < SIZE_4_5MB) {
              if (bestBlob && bestBlob.size >= SIZE_4_5MB) {
                console.log(`Using previous iteration: ${(bestBlob.size / (1024 * 1024)).toFixed(2)}MB`);
                return resolve(bestBlob);
              }
              // If no suitable previous blob, use current (better than nothing)
              console.log(`Below target but using current: ${(compressedBlob.size / (1024 * 1024)).toFixed(2)}MB`);
              return resolve(compressedBlob);
            }
            
            // Store current blob as potential best option
            bestBlob = compressedBlob;
            
            // Reduce dimensions by 2% for next iteration
            currentWidth = Math.floor(currentWidth * 0.98);
            currentHeight = Math.floor(currentHeight * 0.98);
            
            // Don't go below reasonable minimum
            if (currentWidth < 512 || currentHeight < 512) {
              console.log(`Minimum dimensions reached, using best available: ${(bestBlob.size / (1024 * 1024)).toFixed(2)}MB`);
              return resolve(bestBlob);
            }
            
            iterations++;
          }
          
          // Fallback: return the best blob we have
          console.log(`Max iterations reached, using best: ${bestBlob ? (bestBlob.size / (1024 * 1024)).toFixed(2) : 'none'}MB`);
          return resolve(bestBlob || lastBlob!);
        };
        
        compressLoop();
      };
    };
    reader.onerror = (error) => reject(error);
  });
};