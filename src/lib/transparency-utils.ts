/**
 * Utility functions for detecting and handling transparent images
 */

/**
 * Detects if an image file has transparency (alpha channel with values < 255)
 * @param file - The image file to check
 * @returns Promise<boolean> - True if the image has transparency
 */
export const detectImageTransparency = async (file: File): Promise<boolean> => {
  return new Promise((resolve) => {
    // Only PNG files can have transparency in common web formats
    if (!file.type.includes('png')) {
      resolve(false);
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = Math.min(img.width, 200); // Sample smaller area for performance
      canvas.height = Math.min(img.height, 200);
      
      // Scale down for performance while maintaining aspect ratio
      const scale = Math.min(200 / img.width, 200 / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      
      ctx?.drawImage(img, 0, 0, scaledWidth, scaledHeight);
      
      try {
        const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        if (!imageData) {
          resolve(false);
          return;
        }
        
        // Sample every 4th pixel for performance (still very accurate)
        let transparentPixels = 0;
        let totalSampled = 0;
        
        for (let i = 3; i < imageData.data.length; i += 16) { // Every 4th pixel's alpha
          totalSampled++;
          if (imageData.data[i] < 255) {
            transparentPixels++;
          }
          
          // If we find significant transparency, we can return early
          if (transparentPixels > 10 && transparentPixels / totalSampled > 0.05) {
            resolve(true);
            return;
          }
        }
        
        // Consider it transparent if more than 1% of sampled pixels have transparency
        const transparencyRatio = transparentPixels / totalSampled;
        resolve(transparencyRatio > 0.01);
        
      } catch (error) {
        console.error('Error detecting transparency:', error);
        resolve(false);
      }
    };
    
    img.onerror = () => resolve(false);
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Estimates the percentage of transparent pixels in an image
 * @param file - The image file to analyze
 * @returns Promise<number> - Percentage of transparent pixels (0-100)
 */
export const getTransparencyPercentage = async (file: File): Promise<number> => {
  return new Promise((resolve) => {
    if (!file.type.includes('png')) {
      resolve(0);
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Use smaller sample size for performance
      const sampleSize = 100;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      
      ctx?.drawImage(img, 0, 0, sampleSize, sampleSize);
      
      try {
        const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        if (!imageData) {
          resolve(0);
          return;
        }
        
        let transparentPixels = 0;
        const totalPixels = canvas.width * canvas.height;
        
        for (let i = 3; i < imageData.data.length; i += 4) {
          if (imageData.data[i] < 255) {
            transparentPixels++;
          }
        }
        
        const percentage = (transparentPixels / totalPixels) * 100;
        resolve(Math.round(percentage * 100) / 100); // Round to 2 decimal places
        
      } catch (error) {
        console.error('Error calculating transparency percentage:', error);
        resolve(0);
      }
    };
    
    img.onerror = () => resolve(0);
    img.src = URL.createObjectURL(file);
  });
};