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
  intensity: 0.65, // ⬆️ Increased from 0.4 to 0.65 (more visible reflection)
  height: 0.6, // Keep at 0.6
  blur: 4, // Keep at 4
  fadeStrength: 0.8, // Keep at 0.8
  offset: 0, // Keep at 0
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
        }

        const result = canvas.toDataURL("image/png");
        console.log("✅ Reflection generated successfully");
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
