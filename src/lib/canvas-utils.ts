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

    // 3. Calculate Final Positioning based on normalized coordinates
    const { width: subjectW, height: subjectH } = subjectLayer;

    // X is centered (placement.x = 0.5 means center)
    const finalX = Math.round((outputWidth * placement.x) - (subjectW / 2));
    
    // Y position: placement.y represents where the bottom of the subject should be
    // 0 = top, 1 = bottom, 0.75 = 75% down (typical floor position)
    const finalY = Math.round((outputHeight * placement.y) - subjectH);
    
    const finalReflectionY = Math.round(finalY + subjectH);


    // 4. Draw Reflection (IF ENABLED)
    if (reflectionOptions && reflectionOptions.opacity > 0) {
      ctx.save();

      // Position the reflection
      ctx.translate(finalX, finalReflectionY);
      ctx.scale(1, -1); // Flip vertically

      // Draw the CLEAN subject image flipped
      ctx.drawImage(cleanSubjectImg, 0, 0, subjectW, subjectH);

      // Create fade-out gradient
      const gradient = ctx.createLinearGradient(
        0,
        0,
        0,
        subjectH * reflectionOptions.falloff,
      );

      const startOpacity = reflectionOptions.opacity;
      // This gradient masks the image, fading it to transparency.
      // destination-in means "keep where new shape is".
      // We draw a gradient that goes from semi-transparent to fully transparent.
      gradient.addColorStop(0, `rgba(0, 0, 0, ${startOpacity})`);
      gradient.addColorStop(1, `rgba(0, 0, 0, 0)`);

      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, subjectW, subjectH);

      ctx.restore();
    }

    // 5. Draw Main Subject (on top of backdrop and reflection)
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