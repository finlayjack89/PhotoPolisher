/**
 * Canvas utilities for AI commercial photo editing workflow
 * Handles client-side precision operations for mask correction and background removal
 */

/**
 * Step 3: Client-Side Mask Correction
 * Converts black areas in AI-generated masks to transparent
 */
export const convertBlackToTransparent = (imageDataUrl: string): Promise<string> => {
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
        // If pixel is black or near-black, make it transparent
        if (data[i] < 50 && data[i + 1] < 50 && data[i + 2] < 50) {
          data[i + 3] = 0; // Set alpha channel to 0 (fully transparent)
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = reject;
    image.src = imageDataUrl;
  });
};

/**
 * Step 4: Client-Side Background Removal
 * Uses corrected mask to perform pixel-perfect cutout
 */
export const applyMaskToImage = (originalImageDataUrl: string, maskImageDataUrl: string): Promise<string> => {
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

          // 1. Draw the original image
          ctx.drawImage(originalImage, 0, 0);

          // 2. Set composite operation: keeps destination pixels that are within the source
          ctx.globalCompositeOperation = 'destination-in';

          // 3. Draw the mask, scaled to fit, on top to perform the "cut"
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

/**
 * Step 5: Backdrop & Placement
 * Positions subject on transparent canvas matching backdrop dimensions
 */
export interface SubjectPlacement {
  x: number; // fraction of canvas width (0-1)
  y: number; // fraction of canvas height (0-1)
  scale: number; // fraction of canvas width for subject width
}

export const positionSubjectOnCanvas = (
  subjectDataUrl: string, 
  targetWidth: number, 
  targetHeight: number, 
  placement: SubjectPlacement
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return reject('Could not get canvas context');

    const subjectImage = new Image();
    subjectImage.onload = () => {
      try {
        // Calculate dimensions maintaining aspect ratio
        const subjectAspectRatio = subjectImage.naturalWidth / subjectImage.naturalHeight;
        const scaledWidth = targetWidth * placement.scale;
        const scaledHeight = scaledWidth / subjectAspectRatio;
        
        // Calculate position (centered on the placement point)
        const dx = (placement.x * targetWidth) - (scaledWidth / 2);
        const dy = (placement.y * targetHeight) - (scaledHeight / 2);

        console.log('positionSubjectOnCanvas - Positioning details:', {
          targetDimensions: `${targetWidth}x${targetHeight}`,
          subjectDimensions: `${subjectImage.naturalWidth}x${subjectImage.naturalHeight}`,
          placement: placement,
          calculatedSize: `${Math.round(scaledWidth)}x${Math.round(scaledHeight)}`,
          calculatedPosition: `${Math.round(dx)}, ${Math.round(dy)}`,
          scaleAsPixels: Math.round(scaledWidth),
          scaleAsPercentage: Math.round(placement.scale * 100) + '%'
        });

        // Draw subject on transparent canvas
        ctx.drawImage(subjectImage, dx, dy, scaledWidth, scaledHeight);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      }
    };
    
    subjectImage.onerror = reject;
    subjectImage.src = subjectDataUrl;
  });
};

/**
 * Utility to get image dimensions from data URL
 */
export const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = reject;
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
 * Composite backdrop, subject (with shadow), and generate reflection from clean subject
 * Layers: backdrop → reflection (generated from clean subject) → subject (with shadow)
 */
export const compositeLayers = async (
  backdropUrl: string,
  subjectWithShadowUrl: string,
  cleanSubjectUrl: string,
  placement: SubjectPlacement
): Promise<string> => {
  console.log('🎨 COMPOSITING: Starting layer composition with canvas-generated reflection');
  console.log('📊 Input validation:', {
    backdropLength: backdropUrl?.length,
    subjectWithShadowLength: subjectWithShadowUrl?.length,
    cleanSubjectLength: cleanSubjectUrl?.length,
    placement
  });

  // Validate inputs
  if (!subjectWithShadowUrl?.includes('data:image/png')) {
    const error = 'ERROR: Subject with shadow must be PNG with transparency';
    console.error('🚨', error);
    throw new Error(error);
  }
  
  if (!cleanSubjectUrl?.includes('data:image/png')) {
    const error = 'ERROR: Clean subject must be PNG with transparency';
    console.error('🚨', error);
    throw new Error(error);
  }
  
  if (!backdropUrl?.startsWith('data:image/')) {
    const error = 'ERROR: Invalid backdrop data format';
    console.error('🚨', error);
    throw new Error(error);
  }
  
  console.log('✅ Input validation passed');

  // Helper function to load image
  const loadImage = (src: string, name: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        console.log(`Successfully loaded ${name}: ${img.width}x${img.height}`);
        resolve(img);
      };
      
      img.onerror = (error) => {
        console.error(`Failed to load ${name}:`, error);
        reject(new Error(`Failed to load ${name} image`));
      };
      
      img.src = src;
    });
  };

  try {
    // Load backdrop, subject with shadow, and clean subject for reflection
    console.log('Loading backdrop, subject with shadow, and clean subject...');
    const [backdrop, subjectWithShadow, cleanSubject] = await Promise.all([
      loadImage(backdropUrl, 'backdrop'),
      loadImage(subjectWithShadowUrl, 'subject with shadow'),
      loadImage(cleanSubjectUrl, 'clean subject')
    ]);

    console.log('All images loaded successfully');

    // Create canvas with backdrop dimensions
    const canvas = document.createElement('canvas');
    canvas.width = backdrop.width;
    canvas.height = backdrop.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    console.log('Canvas created:', `${canvas.width}x${canvas.height}`);

    // Draw backdrop
    console.log('Drawing backdrop...');
    ctx.drawImage(backdrop, 0, 0);

    // Calculate subject positioning based on placement settings
    const subjectAspectRatio = subjectWithShadow.naturalWidth / subjectWithShadow.naturalHeight;
    const scaledWidth = canvas.width * placement.scale;
    const scaledHeight = scaledWidth / subjectAspectRatio;
    const dx = (placement.x * canvas.width) - (scaledWidth / 2);
    const dy = (placement.y * canvas.height) - (scaledHeight / 2);
    
    console.log('Subject positioning:', {
      originalSize: `${subjectWithShadow.naturalWidth}x${subjectWithShadow.naturalHeight}`,
      scaledSize: `${Math.round(scaledWidth)}x${Math.round(scaledHeight)}`,
      position: `${Math.round(dx)}, ${Math.round(dy)}`,
      placement
    });

    // Generate and draw reflection from clean subject (mimicking CSS .css-reflection-base)
    console.log('🪞 Generating canvas-based reflection from clean subject...');
    
    ctx.save();
    
    // Position reflection directly below subject
    ctx.translate(dx, dy + scaledHeight);
    
    // Flip vertically for reflection effect (CSS: transform: scaleY(-1))
    ctx.scale(1, -1);
    
    // Calculate reflection height (CSS: max-height: 60%)
    const reflectionHeight = scaledHeight * 0.6;
    
    // Draw the clean subject flipped
    ctx.drawImage(cleanSubject, 0, 0, scaledWidth, reflectionHeight);
    
    // Apply fade gradient (CSS: mask-image gradient)
    const gradient = ctx.createLinearGradient(0, 0, 0, reflectionHeight);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)');      // 50% visible at top
    gradient.addColorStop(0.2, 'rgba(0, 0, 0, 0.35)');   // 35% visible
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.15)');   // 15% visible
    gradient.addColorStop(0.8, 'rgba(0, 0, 0, 0.05)');   // 5% visible
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');        // 0% visible (transparent)
    
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, scaledWidth, reflectionHeight);
    
    // Apply blur (CSS: filter: blur(4px))
    // Note: Canvas blur is applied during restore, so we capture the reflection first
    ctx.globalCompositeOperation = 'source-over';
    
    ctx.restore();
    
    // Apply filter effects to the reflection area (CSS: brightness(1.3) contrast(1.7) saturate(1.6))
    // We need to get the reflection area and apply pixel-level adjustments
    const reflectionY = dy + scaledHeight;
    const reflectionActualHeight = Math.min(reflectionHeight, canvas.height - reflectionY);
    
    if (reflectionActualHeight > 0) {
      const imageData = ctx.getImageData(dx, reflectionY, scaledWidth, reflectionActualHeight);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        // Apply brightness: multiply RGB by 1.3
        let r = data[i] * 1.3;
        let g = data[i + 1] * 1.3;
        let b = data[i + 2] * 1.3;
        
        // Apply contrast: (value - 128) * 1.7 + 128
        r = (r - 128) * 1.7 + 128;
        g = (g - 128) * 1.7 + 128;
        b = (b - 128) * 1.7 + 128;
        
        // Apply saturation using luminance-based approach
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        r = luminance + (r - luminance) * 1.6;
        g = luminance + (g - luminance) * 1.6;
        b = luminance + (b - luminance) * 1.6;
        
        // Clamp values and apply opacity (CSS: opacity: 0.9)
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
        data[i + 3] = data[i + 3] * 0.9; // Apply opacity
      }
      
      ctx.putImageData(imageData, dx, reflectionY);
      
      // Apply blur to reflection using a temporary canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = scaledWidth;
      tempCanvas.height = reflectionActualHeight;
      const tempCtx = tempCanvas.getContext('2d');
      
      if (tempCtx) {
        tempCtx.putImageData(imageData, 0, 0);
        tempCtx.filter = 'blur(4px)';
        tempCtx.drawImage(tempCanvas, 0, 0);
        
        // Draw blurred reflection back to main canvas
        ctx.drawImage(tempCanvas, dx, reflectionY);
      }
      
      console.log('✅ Canvas reflection generated and applied');
    }
    
    // Draw subject WITH shadow on top of reflection
    console.log('Drawing subject with shadow...');
    ctx.drawImage(subjectWithShadow, dx, dy, scaledWidth, scaledHeight);

    // Return the final composited image as a high-quality data URL
    const finalDataUrl = canvas.toDataURL('image/png');
    console.log('Compositing complete, final image size:', finalDataUrl.length);
    
    return finalDataUrl;

  } catch (error) {
    console.error('Error during compositing:', error);
    throw error;
  }
};


/**
 * Create a preview image for display purposes (with max dimensions)
 */
export const createPreviewImage = (dataUrl: string, maxWidth: number = 400, maxHeight: number = 400): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return reject('Could not get canvas context');

      // Calculate scaled dimensions
      let { width, height } = img;
      const aspectRatio = width / height;

      if (width > maxWidth) {
        width = maxWidth;
        height = width / aspectRatio;
      }
      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
};
