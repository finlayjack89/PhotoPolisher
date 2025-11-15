// src/lib/canvas-utils.ts
import { loadImage } from './image-resize-utils';

export interface SubjectPlacement {
  x: number; // Horizontal position (0-1, where 0.5 is center)
  y: number; // Vertical position (0-1, where 0 is top, 1 is bottom)
  scale: number; // Scale factor for the subject
}

// This is the main layer, which is the *shadowed* subject
export interface CompositeLayer {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReflectionOptions {
  opacity: number;
  falloff: number;
}

export interface CompositeOptions {
  outputWidth: number;
  outputHeight: number;
  backdropUrl: string;
  subjectLayer: CompositeLayer;    // The main SHADOWED subject
  cleanSubjectUrl: string;       // The CLEAN subject (for reflection)
  placement: SubjectPlacement;
  paddingPercent: number;          // e.g., 10 for 10%
  reflectionOptions?: ReflectionOptions;
}

/**
 * Gets the dimensions of an image from its URL.
 */
export async function getImageDimensions(
  imageUrl: string,
): Promise<{ width: number; height: number }> {
  try {
    const img = await loadImage(imageUrl);
    return { width: img.naturalWidth, height: img.naturalHeight };
  } catch (error) {
    console.error('Error loading image for dimensions:', error);
    return { width: 0, height: 0 };
  }
}

/**
 * Composites all layers onto a single canvas.
 * This function now calculates final positioning and generates reflections.
 */
export async function compositeLayers(
  options: CompositeOptions,
): Promise<Blob | null> {
  const {
    outputWidth,
    outputHeight,
    backdropUrl,
    subjectLayer,
    cleanSubjectUrl,
    placement,
    paddingPercent,
    reflectionOptions,
  } = options;

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    console.error('Failed to get canvas context');
    return null;
  }

  try {
    // 1. Draw Backdrop
    const backdropImg = await loadImage(backdropUrl);
    ctx.drawImage(backdropImg, 0, 0, outputWidth, outputHeight);

    // 2. Load BOTH subject images
    const [subjectImg, cleanSubjectImg] = await Promise.all([
      loadImage(subjectLayer.url),       // Shadowed
      loadImage(cleanSubjectUrl),      // Clean
    ]);

    // 3. Get dimensions for both images
    const subjectW = subjectLayer.width;   // Shadowed dimensions (includes padding from drop shadow)
    const subjectH = subjectLayer.height;
    const cleanW = cleanSubjectImg.naturalWidth;   // Clean dimensions (actual product size)
    const cleanH = cleanSubjectImg.naturalHeight;

    console.log('🎨 [Compositing] Dimensions:', {
      shadowed: { width: subjectW, height: subjectH },
      clean: { width: cleanW, height: cleanH },
      output: { width: outputWidth, height: outputHeight }
    });

    // 4. Calculate Final Positioning based on normalized coordinates
    // Use SHADOWED dimensions for initial positioning (includes shadow padding)
    const finalX = Math.round((outputWidth * placement.x) - (subjectW / 2));
    
    // Y position: placement.y represents where the bottom of the subject should be
    // 0 = top, 1 = bottom, 0.75 = 75% down (typical floor position)
    const finalY = Math.round((outputHeight * placement.y) - subjectH);

    // Calculate where the ACTUAL PRODUCT appears within the shadowed image
    // Cloudinary uses c_lpad which centers the product within the padded canvas
    const productOffsetX = (subjectW - cleanW) / 2;
    const productOffsetY = (subjectH - cleanH) / 2;

    // Actual product position in the output canvas
    const actualProductX = Math.round(finalX + productOffsetX);
    const actualProductY = Math.round(finalY + productOffsetY);

    console.log('📍 [Compositing] Positions:', {
      shadowedImage: { x: finalX, y: finalY },
      productOffset: { x: productOffsetX, y: productOffsetY },
      actualProduct: { x: actualProductX, y: actualProductY }
    });

    // 5. Draw Reflection (IF ENABLED) - positioned to match actual product
    if (reflectionOptions && reflectionOptions.opacity > 0) {
      // Calculate the scale factor between clean and displayed subject
      // The displayed subject dimensions include shadow padding
      // We need to find the actual product size within the shadowed image
      
      // Estimate the actual product size within the shadowed image
      // Cloudinary's drop shadow typically adds 1.5x-2x padding
      // The product is centered within this padded area
      const estimatedProductWidth = subjectW / 1.5;  // Approximate product width
      const estimatedProductHeight = subjectH / 1.5; // Approximate product height
      
      // Calculate scale factors
      const scaleX = estimatedProductWidth / cleanW;
      const scaleY = estimatedProductHeight / cleanH;
      
      // Use the smaller scale to maintain aspect ratio
      const scale = Math.min(scaleX, scaleY);
      
      // Calculate scaled dimensions for the reflection
      const scaledReflectionW = cleanW * scale;
      const scaledReflectionH = cleanH * scale;
      
      // Create a temporary canvas for the reflection at scaled size
      const reflectionCanvas = document.createElement('canvas');
      reflectionCanvas.width = scaledReflectionW;
      reflectionCanvas.height = scaledReflectionH;
      const reflectionCtx = reflectionCanvas.getContext('2d');
      
      if (reflectionCtx) {
        // Draw the flipped and scaled clean subject on the temporary canvas
        reflectionCtx.save();
        reflectionCtx.translate(0, scaledReflectionH);
        reflectionCtx.scale(1, -1);
        // Draw clean subject scaled to match displayed product size
        reflectionCtx.drawImage(cleanSubjectImg, 0, 0, scaledReflectionW, scaledReflectionH);
        reflectionCtx.restore();
        
        // Apply gradient fade on the temporary canvas
        const gradient = reflectionCtx.createLinearGradient(
          0,
          0,  // Start at top of reflection
          0,
          scaledReflectionH * reflectionOptions.falloff  // End at falloff point
        );
        
        gradient.addColorStop(0, `rgba(255, 255, 255, ${reflectionOptions.opacity})`);
        gradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
        
        reflectionCtx.globalCompositeOperation = 'destination-out';
        reflectionCtx.fillStyle = gradient;
        reflectionCtx.fillRect(0, 0, scaledReflectionW, scaledReflectionH);
        
        // Calculate where reflection should be drawn
        // Center the reflection under the product
        const reflectionX = finalX + (subjectW - scaledReflectionW) / 2;
        const reflectionY = finalY + subjectH;
        
        console.log('🪞 [Reflection] Drawing at:', {
          x: reflectionX,
          y: reflectionY,
          originalDimensions: { width: cleanW, height: cleanH },
          scaledDimensions: { width: scaledReflectionW, height: scaledReflectionH },
          scale: scale
        });
        
        // Draw the reflection from temporary canvas onto main canvas
        ctx.globalAlpha = reflectionOptions.opacity;
        ctx.drawImage(reflectionCanvas, reflectionX, reflectionY);
        ctx.globalAlpha = 1.0;
      }
    }

    // 6. Draw Main Subject (on top of backdrop and reflection)
    ctx.drawImage(subjectImg, finalX, finalY, subjectW, subjectH);

    // 6. Export canvas to blob
    return new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
  } catch (error) {
    console.error('Error during canvas compositing:', error);
    return null;
  }
}