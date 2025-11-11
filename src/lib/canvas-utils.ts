/**
 * Canvas utilities for AI commercial photo editing workflow
 */

export interface SubjectPlacement {
  x: number; // fraction of canvas width (0-1)
  y: number; // fraction of canvas height (0-1)
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

    console.log('Canvas created:', `${canvas.width}x${canvas.height}`);

    // --- 1. Draw Backdrop (Cropped/Zoomed) ---
    console.log('Drawing backdrop with "zoom" effect...');
    const canvasAspect = canvas.width / canvas.height;
    const backdropAspect = backdrop.width / backdrop.height;
    
    let drawW, drawH, drawX, drawY;

    // This logic mimics CSS "background-size: cover"
    if (backdropAspect > canvasAspect) { // Backdrop is wider than canvas
      drawH = canvas.height;
      drawW = backdrop.width * (canvas.height / backdrop.height);
      // Center horizontally on the user's X placement
      drawX = -(drawW - canvas.width) * placement.x; 
      drawY = 0;
    } else { // Backdrop is taller than canvas
      drawW = canvas.width;
      drawH = backdrop.height * (canvas.width / backdrop.width);
      drawX = 0;
      // Align the backdrop's "floor" (placement.y) with the canvas's "floor"
      const backdropFloorPx = backdrop.height * placement.y;
      const canvasFloorPx = canvas.height * placement.y;
      drawY = canvasFloorPx - (backdropFloorPx * (drawW / backdrop.width));
    }
    
    ctx.drawImage(backdrop, drawX, drawY, drawW, drawH);

    // --- 2. Calculate Subject Position (based on padding) ---
    const paddingPercent = padding / 100;
    const subjectAspectRatio = subjectWithShadow.naturalWidth / subjectWithShadow.naturalHeight;

    // Calculate the "box" the subject must fit in, based on padding
    const innerBoxW = canvas.width * (1 - paddingPercent * 2);
    const innerBoxH = canvas.height * (1 - paddingPercent * 2);
    
    let scaledWidth = innerBoxW;
    let scaledHeight = scaledWidth / subjectAspectRatio;
    
    if (scaledHeight > innerBoxH) {
      scaledHeight = innerBoxH;
      scaledWidth = scaledHeight * subjectAspectRatio;
    }
    
    // Position subject based on placement.x and placement.y
    // Clamp to keep subject within padded inner box
    const minX = canvas.width * paddingPercent;
    const maxX = canvas.width * (1 - paddingPercent) - scaledWidth;
    const minY = canvas.height * paddingPercent;
    const maxY = canvas.height * (1 - paddingPercent);
    
    const desiredX = (canvas.width * placement.x) - (scaledWidth / 2);
    const desiredY = (canvas.height * placement.y) - scaledHeight;
    
    const dx = Math.max(minX, Math.min(maxX, desiredX)); // Horizontal positioning clamped
    const dy = Math.max(minY, Math.min(maxY - scaledHeight, desiredY)); // Vertical positioning clamped - keeps entire subject inside box
    
    console.log('Subject positioning:', {
      size: `${scaledWidth}x${scaledHeight}`,
      position: `${Math.round(dx)}, ${Math.round(dy)}`
    });

    // --- 3. Generate and Draw Reflection (THE FIX) ---
    console.log('🪞 Generating canvas-based reflection...');
    
    const reflectionHeight = scaledHeight * 0.6; // 60% height
    ctx.save();
    ctx.translate(dx, dy + scaledHeight); // Position *exactly* below subject
    ctx.scale(1, -1); // Flip vertically
    
    // Draw the *clean* subject (flipped)
    ctx.drawImage(cleanSubject, 0, 0, scaledWidth, reflectionHeight);
    
    // Apply fade gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, reflectionHeight);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)'); // Start at 40% opacity
    gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, scaledWidth, reflectionHeight);
    
    // Apply blur
    ctx.filter = 'blur(2px)';
    // We must draw onto itself to apply the filter
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(canvas, 
      dx, canvas.height - (dy + scaledHeight), scaledWidth, reflectionHeight, // Source (flipped area)
      0, 0, scaledWidth, reflectionHeight // Destination (in the save/restored context)
    );

    ctx.restore(); // Restore context (removes flip, blur, etc.)
    
    // --- 4. Draw Subject (with shadow) ---
    console.log('Drawing subject with shadow on top...');
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
