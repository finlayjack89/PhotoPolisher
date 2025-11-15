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
      ctx.save();

      // Reflection starts at the bottom of the actual product
      const reflectionY = actualProductY + cleanH;

      console.log('🪞 [Reflection] Drawing at:', {
        x: actualProductX,
        y: reflectionY,
        dimensions: { width: cleanW, height: cleanH }
      });

      // Position and flip the reflection
      // After translate, we're at the bottom edge of the product
      // After scale(1, -1), Y coordinates are flipped
      // So we draw at -cleanH to place the reflection below the product
      ctx.translate(actualProductX, reflectionY);
      ctx.scale(1, -1); // Flip vertically

      // Draw the CLEAN subject image at its NATURAL size (no scaling)
      // Using negative Y to draw below the flip point in flipped coordinate space
      ctx.drawImage(cleanSubjectImg, 0, -cleanH, cleanW, cleanH);

      // Create fade-out gradient using clean dimensions
      // Gradient goes from top (strongest) to bottom (transparent) of the reflection
      const gradient = ctx.createLinearGradient(
        0,
        -cleanH,  // Start at top of reflection in flipped space
        0,
        -cleanH + (cleanH * reflectionOptions.falloff),  // End at falloff point
      );

      const startOpacity = reflectionOptions.opacity;
      gradient.addColorStop(0, `rgba(0, 0, 0, ${startOpacity})`);
      gradient.addColorStop(1, `rgba(0, 0, 0, 0)`);

      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = gradient;
      ctx.fillRect(0, -cleanH, cleanW, cleanH);

      ctx.restore();
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