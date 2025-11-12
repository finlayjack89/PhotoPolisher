/**
 * Canvas utilities for AI commercial photo editing workflow
 */

export interface SubjectPlacement {
  x: number; // fraction of canvas width (0-1) - typically 0.5
  y: number; // fraction of canvas height (0-1) - the "floor"
  scale: number; // Legacy, no longer used
}

/**
 * Utility to get image dimensions from data URL or blob URL
 */
export const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = (err) => reject(new Error(`Failed to load image for dimensions: ${err}`));
    img.src = dataUrl;
  });
};

/**
 * Convert File to data URL
 */
export const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as string);
      } else {
        reject('Failed to read file');
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Helper function to load an image
 */
const loadImage = (src: string, name: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`Failed to load ${name} image: ${err}`));
    img.src = src;
  });
};

/**
 * [REFACTORED] Composite backdrop, subject, and reflection
 * This function now implements Subject-Centric Cropping.
 * It creates a canvas of a specific size, then "zooms" the backdrop to fit.
 */
export const compositeLayers = async (
  backdropUrl: string,
  subjectWithShadowUrl: string,
  cleanSubjectUrl: string,
  placement: SubjectPlacement, // Contains the X/Y *floor* placement
  outputCanvasSize: { width: number; height: number },
  padding: number // Master padding (e.g., 20)
): Promise<string> => {
  
  console.log('🎨 COMPOSITING: Starting Subject-Centric composite');
  
  try {
    const [backdrop, subjectWithShadow, cleanSubject] = await Promise.all([
      loadImage(backdropUrl, 'backdrop'),
      loadImage(subjectWithShadowUrl, 'subject with shadow'),
      loadImage(cleanSubjectUrl, 'clean subject')
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = outputCanvasSize.width;
    canvas.height = outputCanvasSize.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // --- 1. Draw Backdrop (Cropped/Zoomed) ---
    const canvasAspect = canvas.width / canvas.height;
    const backdropAspect = backdrop.width / backdrop.height;
    
    let scale = 1;
    let drawX = 0;
    let drawY = 0;
    
    // This logic mimics CSS "background-size: cover"
    if (backdropAspect > canvasAspect) { // Backdrop is wider than canvas
      scale = canvas.height / backdrop.height;
      drawX = -(backdrop.width * scale - canvas.width) / 2; // Center X
    } else { // Backdrop is taller than canvas
      scale = canvas.width / backdrop.width;
      drawY = -(backdrop.height * scale - canvas.height) / 2; // Center Y
    }

    let finalDrawX = drawX;
    let finalDrawY = drawY;

    // Adjust Y based on the floor snap
    const scaledBackdropHeight = backdrop.height * scale;
    const backdropFloorPx = (backdrop.height * placement.y) * scale;
    const canvasFloorPx = canvas.height * placement.y;
    
    const yOffset = canvasFloorPx - (backdropFloorPx + finalDrawY);
    
    finalDrawY = Math.min(0, Math.max(canvas.height - scaledBackdropHeight, finalDrawY + yOffset));
    
    ctx.drawImage(backdrop, finalDrawX, finalDrawY, backdrop.width * scale, backdrop.height * scale);

    // --- 2. Calculate Subject Position (based on padding) ---
    const paddingPercent = padding / 100;
    const subjectAspectRatio = subjectWithShadow.naturalWidth / subjectWithShadow.naturalHeight;

    const innerBoxW = canvas.width * (1 - paddingPercent * 2);
    const innerBoxH = canvas.height * (1 - paddingPercent * 2);
    
    let scaledWidth = innerBoxW;
    let scaledHeight = scaledWidth / subjectAspectRatio;
    
    if (scaledHeight > innerBoxH) {
      scaledHeight = innerBoxH;
      scaledWidth = scaledHeight * subjectAspectRatio;
    }
    
    const dx = (canvas.width - scaledWidth) / 2; // Center horizontally
    const canvasFloorY = canvas.height * placement.y; // The "floor" line
    const dy = canvasFloorY - scaledHeight; // Position subject's bottom on the floor
    
    // --- 3. Generate and Draw Reflection (THE FIX) ---
    const reflectionHeight = scaledHeight * 0.6; // 60% height
    
    // Create a temporary canvas for the reflection *only*
    const reflectCanvas = document.createElement('canvas');
    reflectCanvas.width = scaledWidth;
    reflectCanvas.height = reflectionHeight;
    const reflectCtx = reflectCanvas.getContext('2d');
    
    if (reflectCtx) {
      reflectCtx.save();
      reflectCtx.scale(1, -1); // Flip vertically
      // Draw the *clean* subject (flipped)
      reflectCtx.drawImage(cleanSubject, 0, -reflectionHeight, scaledWidth, reflectionHeight);
      reflectCtx.restore();
      
      // Apply fade gradient
      const gradient = reflectCtx.createLinearGradient(0, 0, 0, reflectionHeight);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)'); // Start at 40% opacity
      gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.1)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      reflectCtx.globalCompositeOperation = 'destination-in';
      reflectCtx.fillStyle = gradient;
      reflectCtx.fillRect(0, 0, scaledWidth, reflectionHeight);
      
      // Draw the reflection from the temp canvas to the main canvas
      ctx.save();
      ctx.filter = 'blur(2px)';
      ctx.drawImage(reflectCanvas, dx, canvasFloorY); // Position reflection *at* the floor line
      ctx.restore();
    }
    
    // --- 4. Draw Subject (with shadow) ---
    ctx.drawImage(subjectWithShadow, dx, dy, scaledWidth, scaledHeight);

    const finalDataUrl = canvas.toDataURL('image/png');
    console.log('Compositing complete.');
    
    return finalDataUrl;

  } catch (error) {
    console.error('Error during compositing:', error);
    throw error;
  }
};

// These functions are no longer used by the main workflow but can be kept
export const convertBlackToTransparent = async (imageDataUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return reject('Could not get canvas context');

      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 50 && data[i + 1] < 50 && data[i + 2] < 50) {
          data[i + 3] = 0;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = reject;
    image.src = imageDataUrl;
  });
};

export const applyMaskToImage = async (originalImageDataUrl: string, maskImageDataUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const originalImage = new Image();
    const maskImage = new Image();
    let loadedCount = 0;

    const onImageLoad = () => {
      loadedCount++;
      if (loadedCount === 2) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = originalImage.naturalWidth;
          canvas.height = originalImage.naturalHeight;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) return reject('Could not get canvas context');

          ctx.drawImage(originalImage, 0, 0);
          ctx.globalCompositeOperation = 'destination-in';
          ctx.drawImage(maskImage, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          reject(error);
        }
      }
    };

    originalImage.onload = onImageLoad;
    maskImage.onload = onImageLoad;
    originalImage.onerror = reject;
    maskImage.onerror = reject;
    originalImage.src = originalImageDataUrl;
    maskImage.src = maskImageDataUrl;
  });
};

export const positionSubjectOnCanvas = async (
  subjectDataUrl: string, 
  targetWidth: number, 
  targetHeight: number, 
  placement: SubjectPlacement
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return reject('Could not get canvas context');

      const scale = placement.scale || 0.8;
      const scaledWidth = targetWidth * scale;
      const scaledHeight = (img.naturalHeight / img.naturalWidth) * scaledWidth;
      
      const x = (targetWidth * placement.x) - (scaledWidth / 2);
      const y = (targetHeight * placement.y) - scaledHeight;
      
      ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = subjectDataUrl;
  });
};
