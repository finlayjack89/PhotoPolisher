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
 * Subject displays at user-controlled scale within the backdrop with user-controlled positioning.
 * No automatic padding or scaling manipulation - users have full control.
 * 
 * @param canvasW - Canvas width (determined by backdrop or aspect ratio)
 * @param canvasH - Canvas height (determined by backdrop or aspect ratio)
 * @param subjectShadowW - Width of shadowed subject image (includes Cloudinary padding)
 * @param subjectShadowH - Height of shadowed subject image (includes Cloudinary padding)
 * @param subjectCleanW - Width of clean subject image (actual product, no padding)
 * @param subjectCleanH - Height of clean subject image (actual product, no padding)
 * @param placement - Subject placement coordinates (x, y normalized 0-1, scale for user control)
 */
export function computeCompositeLayout(
  canvasW: number,
  canvasH: number,
  subjectShadowW: number,
  subjectShadowH: number,
  subjectCleanW: number,
  subjectCleanH: number,
  placement: SubjectPlacement
): CompositeLayout {
  /**
   * ARCHITECTURE - User-Controlled Positioning:
   * 
   * Canvas dimensions are provided (based on backdrop).
   * Subject displays at user-controlled scale (placement.scale).
   * Position is controlled via placement.x and placement.y (normalized 0-1).
   * No automatic padding or scaling - subject renders at original size when scale=1.
   */

  // Use user-controlled scale directly (default 1.0 = original size)
  const userScale = placement.scale || 1.0;
  
  // Calculate shadowed subject drawing dimensions with user scale
  // When userScale=1, subject is drawn at its exact original pixel dimensions
  const drawWidth = subjectShadowW * userScale;
  const drawHeight = subjectShadowH * userScale;
  
  // Position based on placement coordinates (x is center, y is bottom alignment)
  const subjectX = canvasW * placement.x - drawWidth / 2;
  const subjectY = canvasH * placement.y - drawHeight;

  // Calculate actual product (clean image) position within shadowed subject
  // Cloudinary c_lpad centers the product both horizontally and vertically
  const offsetX = ((subjectShadowW - subjectCleanW) / 2) * userScale;
  const offsetY = ((subjectShadowH - subjectCleanH) / 2) * userScale;
  const productX = subjectX + offsetX;
  const productY = subjectY + offsetY;
  const productWidth = subjectCleanW * userScale;
  const productHeight = subjectCleanH * userScale;

  // Calculate reflection position (directly below product)
  const reflectionX = productX;
  const reflectionY = productY + productHeight;
  const reflectionWidth = productWidth;
  const reflectionHeight = productHeight;

  console.log('📐 [Layout Calculation]', {
    input: {
      canvas: { w: canvasW, h: canvasH },
      shadowDims: { w: subjectShadowW, h: subjectShadowH },
      cleanDims: { w: subjectCleanW, h: subjectCleanH },
      placement
    },
    calculated: {
      userScale,
      userControlled: true,
      noAutoPadding: true
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
    scale: userScale
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
  aspectRatio: string;
  numericAspectRatio?: number;
  reflectionOptions?: ReflectionOptions;
  blurBackground?: boolean;
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
    aspectRatio,
    numericAspectRatio,
    reflectionOptions,
    blurBackground
  } = options;

  try {
    // 1. Load all images first to get backdrop dimensions
    const [backdropImg, shadowedSubjectImg, cleanSubjectImg] = await Promise.all([
      loadImage(backdropUrl),
      loadImage(shadowedSubjectUrl),
      loadImage(cleanSubjectUrl)
    ]);

    // 2. Validate backdrop dimensions - NO fallback to subject dimensions
    // This ensures user-controlled positioning without automatic padding
    if (!backdropImg.naturalWidth || !backdropImg.naturalHeight || 
        backdropImg.naturalWidth < 1 || backdropImg.naturalHeight < 1) {
      throw new Error('Backdrop image failed to load or has invalid dimensions. Cannot composite without valid backdrop.');
    }

    // 3. Calculate canvas dimensions based on backdrop and aspect ratio
    // Canvas size is determined by backdrop - NO automatic padding or scaling
    let canvasW: number;
    let canvasH: number;
    
    if (aspectRatio === 'original' && numericAspectRatio) {
      // Use backdrop's natural dimensions for "original" mode
      canvasW = backdropImg.naturalWidth;
      canvasH = backdropImg.naturalHeight;
    } else {
      // Use target aspect ratio with backdrop width as base
      let targetRatio: number;
      if (aspectRatio === '1:1') targetRatio = 1;
      else if (aspectRatio === '4:3') targetRatio = 4 / 3;
      else if (aspectRatio === '3:4') targetRatio = 3 / 4;
      else targetRatio = backdropImg.naturalWidth / backdropImg.naturalHeight;
      
      canvasW = backdropImg.naturalWidth;
      canvasH = canvasW / targetRatio;
    }

    // 3. Compute layout with canvas dimensions (no auto-padding)
    const layout = computeCompositeLayout(
      canvasW,
      canvasH,
      shadowedSubjectWidth,
      shadowedSubjectHeight,
      cleanSubjectWidth,
      cleanSubjectHeight,
      placement
    );

    // 4. Create canvas with calculated dimensions
    const canvas = document.createElement('canvas');
    canvas.width = layout.canvasWidth;
    canvas.height = layout.canvasHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('Failed to get canvas context');
      return null;
    }

    console.log('🎨 [Compositing V2] Rendering without Auto-Lift', { blurBackground });

    // --- REMOVED AUTO-LIFT LOGIC ---
    // We strictly respect the user's placement variable.
    // Reflections are allowed to crop naturally at the canvas edge (photometrically correct).
    const shadowY = layout.shadowedSubjectRect.y;
    const productY = layout.productRect.y;

    // 4. Draw Backdrop (Bottom Layer) - with optional blur
    if (blurBackground) {
      // Create temporary canvas for blurred backdrop
      const blurCanvas = document.createElement('canvas');
      try {
        blurCanvas.width = layout.canvasWidth;
        blurCanvas.height = layout.canvasHeight;
        const blurCtx = blurCanvas.getContext('2d');
        if (blurCtx) {
          blurCtx.filter = 'blur(8px)';
          blurCtx.drawImage(backdropImg, 0, 0, layout.canvasWidth, layout.canvasHeight);
          ctx.drawImage(blurCanvas, 0, 0);
        }
      } finally {
        // Always clean up blur canvas to prevent memory leaks
        cleanupCanvas(blurCanvas);
      }
    } else {
      ctx.drawImage(backdropImg, 0, 0, layout.canvasWidth, layout.canvasHeight);
    }

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
    
    // Clean up main canvas after export
    cleanupCanvas(canvas);
    
    return blob;
  } catch (error) {
    console.error('Error during canvas compositing V2:', error);
    return null;
  }
}