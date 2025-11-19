/**
 * Client-Side Reflection Generation
 * 
 * Reflections are generated entirely in the browser using Canvas API.
 * NO external API calls are made - this is a purely client-side operation
 * that happens during final compositing after shadows are applied.
 * 
 * Process:
 * 1. Takes clean subject image (without shadow)
 * 2. Flips vertically using canvas transforms
 * 3. Applies gradient fade for realistic effect
 * 4. Returns as data URL for compositing
 * 
 * Benefits:
 * - Zero server load
 * - No API timeouts
 * - Instant results
 * - No external dependencies
 */

/**
 * Reflection generation utilities for product images
 * Creates realistic reflections using canvas transformations
 */

export interface ReflectionOptions {
  intensity: number; // 0-1, controls opacity (default: 0.3)
  height: number; // 0-1, fraction of subject height (default: 0.5)
  blur: number; // 0-20, blur amount in pixels (default: 3)
  fadeStrength: number; // 0-1, gradient fade intensity (default: 0.7)
  offset: number; // pixels, gap between subject and reflection (default: 5)
}

const DEFAULT_OPTIONS: ReflectionOptions = {
  intensity: 0.25, // Studio-grade subtle reflection for professional look
  height: 0.6, // Reflect top 60% of product
  blur: 4, // Surface diffusion for photorealism
  fadeStrength: 0.8, // Gradient fade strength
  offset: 0, // No gap (overlap handled in compositor)
};

/**
 * Generate a reflection effect for a transparent subject image
 * Returns a new image with the subject and its reflection
 */
export const generateReflection = async (
  subjectDataUrl: string,
  options: Partial<ReflectionOptions> = {},
): Promise<string> => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        if (!ctx) {
          throw new Error("Could not get canvas context");
        }

        // Calculate reflection dimensions
        const reflectionHeight = Math.floor(img.height * opts.height);

        // Canvas contains ONLY the reflection (not subject)
        canvas.width = img.width;
        canvas.height = reflectionHeight;

        console.log("🪞 Generating reflection:", {
          subjectSize: `${img.width}x${img.height}`,
          reflectionHeight,
          reflectionCanvasHeight: canvas.height,
          options: opts,
        });

        // Create vertically flipped reflection (upside down)
        ctx.save();

        // Flip vertically for proper reflection (upside down)
        ctx.scale(1, -1);
        ctx.translate(0, -reflectionHeight);

        // Draw the reflection - take from BOTTOM of image and flip it
        // For a 70% reflection, we want the bottom 70% of the bag reflected
        const sourceStartY = img.height * (1 - opts.height);
        ctx.drawImage(
          img,
          0,
          sourceStartY,
          img.width,
          img.height * opts.height, // Source: bottom portion of bag
          0,
          0,
          img.width,
          reflectionHeight, // Destination: flipped upside down
        );

        ctx.restore();

        // Apply fade gradient to create realistic reflection fade
        const gradient = ctx.createLinearGradient(0, 0, 0, reflectionHeight);

        // Match CSS preview gradient: mask-image: linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)
        // destination-in uses inverse: 0.5 opacity = 50% visible
        gradient.addColorStop(0, `rgba(0, 0, 0, 0.5)`);     // 50% visible at top
        gradient.addColorStop(0.2, `rgba(0, 0, 0, 0.65)`);  // 35% visible
        gradient.addColorStop(0.5, `rgba(0, 0, 0, 0.85)`);  // 15% visible
        gradient.addColorStop(0.8, `rgba(0, 0, 0, 0.95)`);  // 5% visible
        gradient.addColorStop(1, `rgba(0, 0, 0, 1)`);       // 0% visible (fully transparent)

        // Change this to "destination-in" to PRESERVE color while masking
        ctx.globalCompositeOperation = "destination-in";
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, reflectionHeight);

        // Apply CSS-matching filters: brightness(1.3) contrast(1.7) saturate(1.6)
        const imageData = ctx.getImageData(0, 0, canvas.width, reflectionHeight);
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
          
          // Clamp values to 0-255
          data[i] = Math.max(0, Math.min(255, r));
          data[i + 1] = Math.max(0, Math.min(255, g));
          data[i + 2] = Math.max(0, Math.min(255, b));
        }
        
        ctx.putImageData(imageData, 0, 0);

        // Apply blur to reflection for realism
        if (opts.blur > 0) {
          // Get reflection as image data
          const reflectionImageData = ctx.getImageData(0, 0, canvas.width, reflectionHeight);

          // Create temporary canvas for blur
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = canvas.width;
          tempCanvas.height = reflectionHeight;
          const tempCtx = tempCanvas.getContext("2d");

          if (tempCtx) {
            tempCtx.putImageData(reflectionImageData, 0, 0);
            tempCtx.filter = `blur(${opts.blur}px)`;
            tempCtx.drawImage(tempCanvas, 0, 0);

            // Put blurred reflection back
            ctx.clearRect(0, 0, canvas.width, reflectionHeight);
            ctx.globalCompositeOperation = "source-over";
            ctx.drawImage(tempCanvas, 0, 0);
          }
          
          // Clean up temporary blur canvas to free memory
          tempCanvas.width = 0;
          tempCanvas.height = 0;
        }

        const result = canvas.toDataURL("image/png");
        console.log("✅ Reflection generated successfully");
        
        // Clean up canvas to free memory
        canvas.width = 0;
        canvas.height = 0;
        
        resolve(result);
      } catch (error) {
        console.error("Error generating reflection:", error);
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error("Failed to load subject image for reflection"));
    };

    img.src = subjectDataUrl;
  });
};

/**
 * Studio-Grade Reflection Generator
 * Simplified reflection with professional blur and gradient falloff
 * 
 * @param img - Source image (HTMLImageElement)
 * @param width - Output width
 * @param height - Output height (typically 0.6 * subject height)
 * @param blur - Surface diffusion blur in pixels (default: 4)
 * @param opacity - Master opacity (default: 0.25)
 * @returns Canvas with reflection ready to composite
 */
export async function generateSmartReflection(
  img: HTMLImageElement,
  width: number,
  height: number,
  blur: number = 4,
  opacity: number = 0.25
): Promise<HTMLCanvasElement> {
  console.log('🪞 [SmartReflection] Starting generation:', {
    width,
    height,
    blur,
    opacity,
    imgNaturalWidth: img.naturalWidth,
    imgNaturalHeight: img.naturalHeight
  });

  // Validate dimensions
  if (width <= 0 || height <= 0) {
    console.error('🪞 [SmartReflection] Invalid dimensions:', { width, height });
    throw new Error(`Invalid reflection dimensions: width=${width}, height=${height}`);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    console.error('🪞 [SmartReflection] Failed to get canvas context');
    throw new Error('Could not get context for smart reflection');
  }

  try {
    // 1. Vertical Flip & Surface Diffusion
    console.log('🪞 [SmartReflection] Step 1: Applying vertical flip and blur');
    ctx.save();
    ctx.translate(0, height);
    ctx.scale(1, -1);
    ctx.filter = `blur(${blur}px)`; // Simulates glossy floor diffusion
    ctx.drawImage(img, 0, 0, width, height);
    ctx.restore(); // IMPORTANT: Restore before gradient mask

    // 2. Gradient Mask (Distance Falloff) - Fresnel effect
    console.log('🪞 [SmartReflection] Step 2: Applying Fresnel gradient mask');
    ctx.globalCompositeOperation = 'destination-in';
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');     // Full visibility at touch point
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.6)'); // Mid-fade
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');     // Invisible at bottom
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'source-over';

    console.log('🪞 [SmartReflection] ✅ Generation complete');
    return canvas;
  } catch (error) {
    console.error('🪞 [SmartReflection] ❌ Error during generation:', error);
    throw error;
  }
}

/**
 * Generate reflections for multiple images in parallel
 */
export const generateReflections = async (
  images: Array<{ name: string; data: string }>,
  options: Partial<ReflectionOptions> = {},
): Promise<Array<{ name: string; reflectionData: string }>> => {
  console.log(`🪞 Generating reflections for ${images.length} images`);

  const reflectionPromises = images.map(async (image) => {
    const reflectionData = await generateReflection(image.data, options);
    return {
      name: image.name,
      reflectionData,
    };
  });

  return Promise.all(reflectionPromises);
};
