/**
 * Utility functions for rotating images permanently by modifying the actual image data
 */

export const rotateImage = (imageDataUrl: string, degrees: 90 | -90): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      // For 90° and -90° rotations, swap width and height
      if (degrees === 90 || degrees === -90) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      
      // Clear canvas with transparent background
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Move to center and rotate
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      
      // Draw image centered
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
      
      // Convert back to data URL
      resolve(canvas.toDataURL('image/png'));
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl;
  });
};

export const rotateImageClockwise = (imageDataUrl: string): Promise<string> => {
  return rotateImage(imageDataUrl, 90);
};

export const rotateImageCounterClockwise = (imageDataUrl: string): Promise<string> => {
  return rotateImage(imageDataUrl, -90);
};