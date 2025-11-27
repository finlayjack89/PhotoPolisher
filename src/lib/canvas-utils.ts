// src/lib/canvas-utils.ts
import { loadImage } from './file-utils';
import { generateSmartReflection } from './reflection-utils';

/**
 * Clean up a canvas to hint garbage collection to free memory faster.
 * This is critical for batch processing of large images to prevent memory buildup.
 * 
 * @param canvas - The canvas element to clean up
 */
export function cleanupCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  canvas.width = 0;
  canvas.height = 0;
}


/**
 * Generates a lightweight "Contact Shadow" (Ambient Occlusion) for grounding.
 * Uses a downscaled canvas for high performance and low memory usage.
 * 
 * @param img - The image to generate shadow from
 * @returns Canvas with black silhouette, or null if generation fails
 */
function generateContactShadow(
  img: HTMLImageElement
): HTMLCanvasElement | null {
  try {
    const canvas = document.createElement('canvas');
    // Optimization: Limit shadow resolution to 500px. 
    // It will be blurred anyway, so we don't need 4K precision.
    const scale = Math.min(1, 500 / img.naturalWidth);
    
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Draw the silhouette
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    // 2. Turn it solid black (Source-In)
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    return canvas;
  } catch (e) {
    console.warn('⚠️ Contact shadow generation warning:', e);
    return null; // Fail gracefully, don't crash the app
  }
}

export interface SubjectPlacement {
  x: number; // Horizontal position (0-1, where 0.5 is center)
  y: number; // Vertical position (0-1, where 0 is top, 1 is bottom)
  scale: number; // Scale factor for the subject
}

export interface ReflectionOptions {
  opacity: number;
  falloff: number;
}

/**
 * Rectangle definition for layout calculations
 */
export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Complete layout information for composite rendering
 */
export interface CompositeLayout {
  canvasWidth: number;
  canvasHeight: number;
  shadowedSubjectRect: LayoutRect;  // Where to draw the shadowed subject
  productRect: LayoutRect;          // Where the actual clean product appears
  reflectionRect: LayoutRect;       // Where to draw the reflection
  scale: number;                    // Overall scale factor applied
}

/**
 * Computes the complete layout for compositing, ensuring preview and batch output match exactly.
 * This unified calculation function ensures CSS preview and canvas output have identical dimensions and positioning.
 * 
 * @param subjectShadowW - Width of shadowed subject image (includes Cloudinary padding)
 * @param subjectShadowH - Height of shadowed subject image (includes Cloudinary padding)
 * @param subjectCleanW - Width of clean subject image (actual product, no padding)
 * @param subjectCleanH - Height of clean subject image (actual product, no padding)
 * @param paddingPercent - Padding percentage (e.g., 20 for 20%)
 * @param aspectRatio - Target aspect ratio ('1:1', '3:4', '4:3', 'original')
 * @param numericAspectRatio - Numeric aspect ratio for 'original' mode (width/height)
 * @param placement - Subject placement coordinates (x, y normalized 0-1)
 */
export function computeCompositeLayout(
  subjectShadowW: number,
  subjectShadowH: number,
  subjectCleanW: number,
  subjectCleanH: number,
  paddingPercent: number,
  aspectRatio: string,
  numericAspectRatio: number | undefined,
  placement: SubjectPlacement
): CompositeLayout {
  /**
   * ARCHITECTURE - Matches CSS Preview Behavior:
   * 
   * CSS Preview does:
   *   - Container sets the aspect ratio
   *   - Subject WIDTH = (1 - 2*p) * containerWidth
   *   - Subject HEIGHT = auto (maintains natural aspect ratio)
   * 
   * Canvas must do:
   *   - Canvas width determined by shadow width and padding
   *   - Canvas height determined by width and aspect ratio
   *   - Shadow scales to fit (1-2p) of canvas WIDTH
   *   - Shadow height is whatever it naturally is at this scale
   *   - Letterboxing (empty space) if shadow doesn't fill canvas height
   */
  const p = paddingPercent / 100;

  // 1. Determine target aspect ratio
  let targetRatio: number;
  if (aspectRatio === '1:1') targetRatio = 1;
  else if (aspectRatio === '4:3') targetRatio = 4 / 3;
  else if (aspectRatio === '3:4') targetRatio = 3 / 4;
  else if (aspectRatio === 'original' && numericAspectRatio) {
    targetRatio = numericAspectRatio;
  } else {
    // Fallback to shadow dimensions
    targetRatio = subjectShadowW / subjectShadowH;
  }

  // 2. Calculate canvas dimensions (WIDTH-BASED like CSS preview)
  // Canvas width is sized so shadow occupies (1-2p) of it
  const canvasW = subjectShadowW / (1 - 2 * p);
  // Canvas height comes from aspect ratio
  const canvasH = canvasW / targetRatio;

  // 3. Calculate scale factor
  // Start with width-based scale (primary constraint, like CSS preview)
  // This ensures shadow occupies (1-2p) of canvas WIDTH
  const scaleW = ((1 - 2 * p) * canvasW) / subjectShadowW;
  
  // Calculate what height would be at this scale
  const scaledHeight = subjectShadowH * scaleW;
  
  // If the scaled height would CLIP (exceed full canvas), reduce scale to fit
  // Note: We check against FULL canvas height, not (1-2p)*canvasH
  // This allows letterboxing but prevents actual overflow
  let scale: number;
  if (scaledHeight > canvasH) {
    // Tall asset - scale to fit full canvas height instead
    scale = canvasH / subjectShadowH;
  } else {
    // Normal case - use width-based scale
    scale = scaleW;
  }

  // 5. Calculate shadowed subject drawing dimensions and position
  const drawWidth = subjectShadowW * scale;
  const drawHeight = subjectShadowH * scale;
  const subjectX = canvasW * placement.x - drawWidth / 2;
  const subjectY = canvasH * placement.y - drawHeight; // y represents bottom alignment

  // 6. Calculate actual product (clean image) position within shadowed subject
  // Cloudinary c_lpad centers the product both horizontally and vertically
  const offsetX = ((subjectShadowW - subjectCleanW) / 2) * scale;
  const offsetY = ((subjectShadowH - subjectCleanH) / 2) * scale;
  const productX = subjectX + offsetX;
  const productY = subjectY + offsetY;
  const productWidth = subjectCleanW * scale;
  const productHeight = subjectCleanH * scale;

  // 7. Calculate reflection position (directly below product)
  const reflectionX = productX;
  const reflectionY = productY + productHeight;
  const reflectionWidth = productWidth;
  const reflectionHeight = productHeight;

  console.log('📐 [Layout Calculation]', {
    input: {
      shadowDims: { w: subjectShadowW, h: subjectShadowH },
      cleanDims: { w: subjectCleanW, h: subjectCleanH },
      padding: paddingPercent,
      aspectRatio,
      placement
    },
    calculated: {
      targetRatio,
      canvas: { w: canvasW, h: canvasH },
      scale,
      widthBased: true
    },
    output: {
      shadowedSubject: { x: subjectX, y: subjectY, w: drawWidth, h: drawHeight },
      product: { x: productX, y: productY, w: productWidth, h: productHeight },
      reflection: { x: reflectionX, y: reflectionY, w: reflectionWidth, h: reflectionHeight }
    }
  });

  return {
    canvasWidth: Math.round(canvasW),
    canvasHeight: Math.round(canvasH),
    shadowedSubjectRect: {
      x: Math.round(subjectX),
      y: Math.round(subjectY),
      width: Math.round(drawWidth),
      height: Math.round(drawHeight)
    },
    productRect: {
      x: Math.round(productX),
      y: Math.round(productY),
      width: Math.round(productWidth),
      height: Math.round(productHeight)
    },
    reflectionRect: {
      x: Math.round(reflectionX),
      y: Math.round(reflectionY),
      width: Math.round(reflectionWidth),
      height: Math.round(reflectionHeight)
    },
    scale
  };
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
 * Draws a reflection of the clean subject image onto the main canvas.
 * Uses the new studio-grade reflection with proper overlap to eliminate gaps.
 * 
 * @param ctx - Main canvas context to draw the reflection onto
 * @param cleanSubjectImg - The clean subject image (HTMLImageElement)
 * @param reflectionRect - Where to draw the reflection (x, y, width, height)
 * @param reflectionOptions - Opacity and falloff parameters
 */
async function drawReflection(
  ctx: CanvasRenderingContext2D,
  cleanSubjectImg: HTMLImageElement,
  reflectionRect: LayoutRect,
  reflectionOptions: ReflectionOptions
): Promise<void> {
  const { x, y, width, height } = reflectionRect;
  const { opacity } = reflectionOptions;

  try {
    // Generate studio-grade reflection with blur and gradient
    const reflectionCanvas = await generateSmartReflection(
      cleanSubjectImg,
      width,
      height,
      4,  // blur: 4px for surface diffusion
      opacity // Master opacity baked into the reflection texture
    );

    // Draw reflection onto main canvas
    ctx.save();
    ctx.globalAlpha = 1.0; // FIXED: Use 1.0 to avoid double-fading (opacity already baked into texture)
    ctx.drawImage(reflectionCanvas, x, y, width, height);
    ctx.restore();

    // Clean up reflection canvas
    reflectionCanvas.width = 0;
    reflectionCanvas.height = 0;
  } catch (error) {
    console.error('Failed to generate smart reflection:', error);
  }
}

/**
 * Composites layers using unified layout calculation.
 * This ensures preview and batch output match exactly.
 */
export interface CompositeLayersV2Options {
  backdropUrl: string;
  shadowedSubjectUrl: string;
  cleanSubjectUrl: string;
  shadowedSubjectWidth: number;
  shadowedSubjectHeight: number;
  cleanSubjectWidth: number;
  cleanSubjectHeight: number;
  placement: SubjectPlacement;
  paddingPercent: number;
  aspectRatio: string;
  numericAspectRatio?: number;
  reflectionOptions?: ReflectionOptions;
}

export async function compositeLayersV2(
  options: CompositeLayersV2Options
): Promise<Blob | null> {
  const {
    backdropUrl,
    shadowedSubjectUrl,
    cleanSubjectUrl,
    shadowedSubjectWidth,
    shadowedSubjectHeight,
    cleanSubjectWidth,
    cleanSubjectHeight,
    placement,
    paddingPercent,
    aspectRatio,
    numericAspectRatio,
    reflectionOptions
  } = options;

  // 1. Compute unified layout
  const layout = computeCompositeLayout(
    shadowedSubjectWidth,
    shadowedSubjectHeight,
    cleanSubjectWidth,
    cleanSubjectHeight,
    paddingPercent,
    aspectRatio,
    numericAspectRatio,
    placement
  );

  // 2. Create canvas with calculated dimensions
  const canvas = document.createElement('canvas');
  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    console.error('Failed to get canvas context');
    return null;
  }

  try {
    // 3. Load all images
    const [backdropImg, shadowedSubjectImg, cleanSubjectImg] = await Promise.all([
      loadImage(backdropUrl),
      loadImage(shadowedSubjectUrl),
      loadImage(cleanSubjectUrl)
    ]);

    console.log('🎨 [Compositing V2] Rendering without Auto-Lift');

    // --- REMOVED AUTO-LIFT LOGIC ---
    // We strictly respect the user's placement variable.
    // Reflections are allowed to crop naturally at the canvas edge (photometrically correct).
    const shadowY = layout.shadowedSubjectRect.y;
    const productY = layout.productRect.y;

    // 4. Draw Backdrop (Bottom Layer)
    ctx.drawImage(backdropImg, 0, 0, layout.canvasWidth, layout.canvasHeight);

    // 5. Draw Shadow (Middle Layer 1)
    ctx.drawImage(
        shadowedSubjectImg, 
        layout.shadowedSubjectRect.x, 
        shadowY, // Use lifted Y
        layout.shadowedSubjectRect.width, 
        layout.shadowedSubjectRect.height
    );

    // 6. Draw Reflection (Middle Layer 2) - MUST be before Product
    if (reflectionOptions && reflectionOptions.opacity > 0) {
      // Simple reflection positioning: directly below the product with small overlap
      const GAP_OVERLAP = 2;
      const reflectionY = productY + layout.productRect.height - GAP_OVERLAP;
      const reflectionHeight = Math.round(layout.productRect.height * 0.6);

      const adjustedReflectionRect = {
        x: layout.productRect.x,
        y: reflectionY,
        width: layout.productRect.width,
        height: reflectionHeight
      };
      
      await drawReflection(ctx, cleanSubjectImg, adjustedReflectionRect, reflectionOptions);
    }

    // --- NEW FEATURE: CONTACT SHADOW (Safe Mode) ---
    try {
      const footprint = generateContactShadow(cleanSubjectImg);
      
      if (footprint) {
        ctx.save();
        try {
          // Configuration for "Grounding" Look
          const shadowH = layout.productRect.height * 0.15; // Squash to 15% height
          const shadowW = layout.productRect.width;
          
          // Position: Aligned with bottom, tucked slightly underneath
          // (shadowH * 0.6) moves the dark center under the object
          const shadowY = productY + layout.productRect.height - (shadowH * 0.6);
          const shadowX = layout.productRect.x;

          // Style: Soft blur + 40% opacity
          ctx.filter = 'blur(8px)'; 
          ctx.globalAlpha = 0.4;    
          
          ctx.drawImage(footprint, shadowX, shadowY, shadowW, shadowH);
          
          console.log('🌑 [Contact Shadow] Applied grounding effect');
        } finally {
          ctx.restore(); // CRITICAL: Always reset state even if error occurs
          cleanupCanvas(footprint); // Clean up footprint canvas to reclaim memory
        }
      }
    } catch (err) {
      console.warn('⚠️ Skipping contact shadow due to error:', err);
    }
    // -----------------------------------------------

    // 7. Draw Clean Product (Top Layer)
    ctx.drawImage(
        cleanSubjectImg, 
        layout.productRect.x, 
        productY, // Use lifted Y
        layout.productRect.width, 
        layout.productRect.height
    );

    // 8. Export to blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    
    return blob;
  } catch (error) {
    console.error('Error during canvas compositing V2:', error);
    return null;
  } finally {
    // Clean up canvas to free memory
    cleanupCanvas(canvas);
  }
}