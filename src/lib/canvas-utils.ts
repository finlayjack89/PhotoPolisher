// src/lib/canvas-utils.ts
import { loadImage } from './file-utils';
import { generateSmartReflection } from './reflection-utils';

/**
 * Reference Width for Scaling Strategy
 * All spatial effects (blurs, offsets, shadows) are calculated dynamically
 * based on this reference standard, ensuring preview and export match pixel-for-pixel.
 * 
 * Formula: ScaledValue = BaseValue × (CurrentCanvasWidth / REFERENCE_WIDTH)
 */
export const REFERENCE_WIDTH = 3000;

/**
 * Calculates a scaled value based on the current canvas width.
 * Ensures effects look consistent across different resolutions.
 * 
 * The scaling ensures PIXEL-FOR-PIXEL PARITY between preview and export:
 * - Preview at 600px with 1.8px blur → scaled up 5x = 9px blur
 * - Export at 3000px with 9px blur → identical when viewed at same physical size
 * - Export at 6000px with 18px blur → downscaled to 3000px = 9px blur equivalent
 * 
 * IMPORTANT: No maximum cap is applied because:
 * 1. Proportional scaling is required for true pixel-for-pixel parity
 * 2. 18px blur on 6000px canvas = 9px blur on 3000px canvas visually
 * 3. Capping would break parity for exports larger than REFERENCE_WIDTH
 * 
 * Only minimum clamping is applied to prevent blur from becoming invisible.
 * 
 * @param baseValue - The base value calibrated for REFERENCE_WIDTH (3000px)
 * @param currentWidth - The actual canvas width being rendered
 * @param minValue - Optional minimum value to prevent artifacts (default: 0.5)
 * @returns Scaled value appropriate for the current canvas size
 */
export function getScaledValue(baseValue: number, currentWidth: number, minValue: number = 0.5): number {
  const scaledValue = baseValue * (currentWidth / REFERENCE_WIDTH);
  // Only clamp minimum to prevent invisible effects on small canvases
  // No maximum cap - proportional scaling is required for pixel-for-pixel parity
  return Math.max(minValue, scaledValue);
}

/**
 * Applies a realistic f/2.8 depth of field effect with a gradual floor ramp.
 * Configured for "75% intensity" (9px at 3000px) and "starts lower" logic (0.9 stop).
 * Uses dynamic scaling to ensure preview matches export.
 * Exported for use in Live Canvas Preview to ensure WYSIWYG accuracy.
 */
export function applyDepthOfField(
  ctx: CanvasRenderingContext2D, 
  image: HTMLImageElement, 
  width: number, 
  height: number
): void {
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = width;
  blurCanvas.height = height;
  const blurCtx = blurCanvas.getContext('2d');
  
  if (!blurCtx) return;

  // Dynamic blur scaling: 9px base at 3000px reference
  const scaledBlur = getScaledValue(9, width);
  console.log(`📷 [DoF] Blur scaling: ${scaledBlur.toFixed(2)}px (base: 9px, width: ${width}px)`);
  
  blurCtx.filter = `blur(${scaledBlur}px)`; 
  blurCtx.drawImage(image, 0, 0, width, height);
  blurCtx.filter = 'none';

  // 2. Refined "Long Ramp" Gradient
  // Pushes the zero-blur point down to 100%, with partial blur starting at 90%
  const gradient = blurCtx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(0,0,0,1)');        // Top: Max blur
  gradient.addColorStop(0.4, 'rgba(0,0,0,0.85)');   // Horizon: Strong blur
  gradient.addColorStop(0.65, 'rgba(0,0,0,0.5)');   // Mid-Floor: Visible blur
  gradient.addColorStop(0.9, 'rgba(0,0,0,0.15)');   // Low-Floor: Subtle blur creeps in
  gradient.addColorStop(1, 'rgba(0,0,0,0)');        // Bottom Edge: Sharp anchor

  // 3. Apply Mask
  blurCtx.globalCompositeOperation = 'destination-in';
  blurCtx.fillStyle = gradient;
  blurCtx.fillRect(0, 0, width, height);

  // 4. Composite
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(blurCanvas, 0, 0);
  ctx.restore();
  
  // 5. Cleanup
  blurCanvas.width = 0;
  blurCanvas.height = 0;
};

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
 * Blur is dynamically scaled based on canvas width for consistent appearance.
 * 
 * @param ctx - Main canvas context to draw the reflection onto
 * @param cleanSubjectImg - The clean subject image (HTMLImageElement)
 * @param reflectionRect - Where to draw the reflection (x, y, width, height)
 * @param reflectionOptions - Opacity and falloff parameters
 * @param canvasWidth - Canvas width for dynamic blur scaling
 */
async function drawReflection(
  ctx: CanvasRenderingContext2D,
  cleanSubjectImg: HTMLImageElement,
  reflectionRect: LayoutRect,
  reflectionOptions: ReflectionOptions,
  canvasWidth: number
): Promise<void> {
  const { x, y, width, height } = reflectionRect;
  const { opacity } = reflectionOptions;

  // Dynamic blur scaling: 4px base at 3000px reference
  const scaledBlur = getScaledValue(4, canvasWidth);
  console.log(`🪞 [Reflection] Blur scaling: ${scaledBlur.toFixed(2)}px (base: 4px, canvasWidth: ${canvasWidth}px)`);

  try {
    // Generate studio-grade reflection with dynamically scaled blur
    const reflectionCanvas = await generateSmartReflection(
      cleanSubjectImg,
      width,
      height,
      scaledBlur,  // Dynamic blur based on canvas width
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

    // 4. Draw Backdrop (Bottom Layer)
    if (blurBackground) {
      // Draw sharp base first
      ctx.drawImage(backdropImg, 0, 0, layout.canvasWidth, layout.canvasHeight);
      
      // Apply the tuned Depth of Field overlay
      console.log('📷 Applying tuned f/2.8 Depth of Field...');
      applyDepthOfField(ctx, backdropImg, layout.canvasWidth, layout.canvasHeight);
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
      
      // Pass canvasWidth for dynamic blur scaling
      await drawReflection(ctx, cleanSubjectImg, adjustedReflectionRect, reflectionOptions, layout.canvasWidth);
    }

    // --- NEW FEATURE: CONTACT SHADOW (Grounding) ---
    try {
      const footprint = generateContactShadow(cleanSubjectImg);
      
      if (footprint) {
        ctx.save();
        try {
          const SQUASH_FACTOR = 0.15;
          const SHADOW_OPACITY = 0.5;
          const BASE_BLUR_PX = 12;
          
          const shadowW = layout.productRect.width;
          const shadowH = layout.productRect.height * SQUASH_FACTOR;
          
          const shadowX = layout.productRect.x;
          const shadowY = (layout.productRect.y + layout.productRect.height) - (shadowH * 0.6);

          const scaledBlur = getScaledValue(BASE_BLUR_PX, layout.canvasWidth);
          
          console.log(`🌑 [Contact Shadow] Generating:`, {
            dims: `${Math.round(shadowW)}x${Math.round(shadowH)}`,
            blur: `${scaledBlur.toFixed(1)}px`,
            y: Math.round(shadowY)
          });
          
          ctx.filter = `blur(${scaledBlur}px)`; 
          ctx.globalAlpha = SHADOW_OPACITY;
          ctx.globalCompositeOperation = 'source-over';
          
          ctx.drawImage(footprint, shadowX, shadowY, shadowW, shadowH);
        } finally {
          ctx.restore();
          cleanupCanvas(footprint);
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