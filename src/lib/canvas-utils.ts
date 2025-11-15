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
  const subjectY = canvasH * placement.y - drawHeight; // y represents bottom alignment (FIX: use canvasH not canvasW)

  // 6. Calculate actual product (clean image) position within shadowed subject
  // Cloudinary c_lpad centers the product horizontally, but the drop shadow effect
  // causes asymmetric vertical padding (more at bottom due to shadow extending down)
  const offsetX = ((subjectShadowW - subjectCleanW) / 2) * scale;
  const offsetY = ((subjectShadowH - subjectCleanH) / 2) * scale;
  const productX = subjectX + offsetX;
  const productY = subjectY + offsetY;
  const productWidth = subjectCleanW * scale;
  const productHeight = subjectCleanH * scale;

  // 7. Calculate reflection position (directly below product)
  // The Cloudinary shadow has asymmetric padding: the drop shadow effect extends
  // the image downward more than upward. We need to compensate for this when 
  // positioning the reflection to avoid a gap.
  // 
  // Empirical testing shows the bottom padding offset is approximately 15-20% of
  // the total vertical padding. This may vary with shadow parameters (elevation,
  // spread, etc.) and can be adjusted based on testing.
  // 
  // TODO: Make this configurable or derive from shadow parameters if needed
  const totalVerticalPadding = (subjectShadowH - subjectCleanH) * scale;
  const BOTTOM_PADDING_RATIO = 0.30; // Adjust this value if reflection gap persists
  const bottomPaddingOffset = totalVerticalPadding * BOTTOM_PADDING_RATIO;
  
  const reflectionX = productX;
  const reflectionY = productY + productHeight - bottomPaddingOffset;
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
 * The reflection is vertically flipped and has a gradient fade from opaque to transparent.
 * 
 * @param ctx - Main canvas context to draw the reflection onto
 * @param cleanSubjectImg - The clean subject image (HTMLImageElement)
 * @param reflectionRect - Where to draw the reflection (x, y, width, height)
 * @param reflectionOptions - Opacity and falloff parameters
 */
function drawReflection(
  ctx: CanvasRenderingContext2D,
  cleanSubjectImg: HTMLImageElement,
  reflectionRect: LayoutRect,
  reflectionOptions: ReflectionOptions
): void {
  const { x, y, width, height } = reflectionRect;
  const { opacity, falloff } = reflectionOptions;

  // Create temporary canvas for reflection rendering
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d');

  if (!tempCtx) {
    console.error('Failed to create temp canvas context for reflection');
    return;
  }

  // 1. Draw the clean subject flipped vertically
  tempCtx.save();
  tempCtx.translate(0, height);
  tempCtx.scale(1, -1);
  tempCtx.drawImage(cleanSubjectImg, 0, 0, width, height);
  tempCtx.restore();

  // 2. Apply gradient fade using destination-out composition
  // This creates a fade from full intensity (top) to transparent (bottom)
  const gradient = tempCtx.createLinearGradient(0, 0, 0, height * falloff);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');  // Top: keep full intensity (0 alpha removed)
  gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');   // Bottom: fully transparent (1 alpha removed)

  tempCtx.globalCompositeOperation = 'destination-out';
  tempCtx.fillStyle = gradient;
  tempCtx.fillRect(0, 0, width, height);

  // 3. Composite the reflection onto the main canvas with opacity applied
  ctx.globalAlpha = opacity;
  ctx.drawImage(tempCanvas, x, y);
  ctx.globalAlpha = 1.0;

  console.log('🪞 [Reflection] Drawn at:', {
    position: { x, y },
    dimensions: { width, height },
    opacity,
    falloff
  });
}

/**
 * Composites all layers onto a single canvas using computeCompositeLayout for unified positioning.
 * This ensures the output matches the preview exactly.
 * 
 * NOTE: This function is DEPRECATED - use the new compositeLayers interface below instead.
 */
export async function compositeLayers(
  options: CompositeOptions,
): Promise<Blob | null> {
  const {
    backdropUrl,
    subjectLayer,
    cleanSubjectUrl,
    placement,
    paddingPercent,
    reflectionOptions,
  } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    console.error('Failed to get canvas context');
    return null;
  }

  try {
    // Load all required images
    const [backdropImg, subjectImg, cleanSubjectImg] = await Promise.all([
      loadImage(backdropUrl),
      loadImage(subjectLayer.url),       // Shadowed
      loadImage(cleanSubjectUrl),        // Clean
    ]);

    // Get clean subject dimensions (no padding)
    const cleanW = cleanSubjectImg.naturalWidth;
    const cleanH = cleanSubjectImg.naturalHeight;

    console.log('🎨 [Compositing - DEPRECATED] Using old interface. Consider migrating to new interface.');
    console.log('Dimensions:', {
      shadowed: { width: subjectLayer.width, height: subjectLayer.height },
      clean: { width: cleanW, height: cleanH },
      requestedOutput: { width: options.outputWidth, height: options.outputHeight }
    });

    // FALLBACK: Use the provided dimensions for now (old behavior)
    // TODO: Migrate callers to use the new interface
    canvas.width = options.outputWidth;
    canvas.height = options.outputHeight;

    // Draw backdrop
    ctx.drawImage(backdropImg, 0, 0, canvas.width, canvas.height);

    // Calculate positioning using old logic
    const finalX = Math.round((canvas.width * placement.x) - (subjectLayer.width / 2));
    const finalY = Math.round((canvas.height * placement.y) - subjectLayer.height);

    // Draw reflection if enabled
    if (reflectionOptions && reflectionOptions.opacity > 0) {
      const productOffsetX = (subjectLayer.width - cleanW) / 2;
      const productOffsetY = (subjectLayer.height - cleanH) / 2;
      const actualProductX = finalX + productOffsetX;
      const actualProductY = finalY + productOffsetY;

      const estimatedScale = Math.min(
        (subjectLayer.width / 1.5) / cleanW,
        (subjectLayer.height / 1.5) / cleanH
      );

      drawReflection(
        ctx,
        cleanSubjectImg,
        {
          x: Math.round(actualProductX),
          y: Math.round(actualProductY + cleanH * estimatedScale),
          width: Math.round(cleanW * estimatedScale),
          height: Math.round(cleanH * estimatedScale)
        },
        reflectionOptions
      );
    }

    // Draw shadowed subject on top
    ctx.drawImage(subjectImg, finalX, finalY, subjectLayer.width, subjectLayer.height);

    // Export to blob
    return new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
  } catch (error) {
    console.error('Error during canvas compositing:', error);
    return null;
  }
}

/**
 * NEW INTERFACE: Composites layers using unified layout calculation.
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

    console.log('🎨 [Compositing V2] Using unified layout calculation');

    // 4. Draw backdrop
    ctx.drawImage(backdropImg, 0, 0, layout.canvasWidth, layout.canvasHeight);

    // 5. Draw shadow layer (shadowedSubject from Cloudinary contains ONLY the shadow)
    const shadowRect = layout.shadowedSubjectRect;
    ctx.drawImage(shadowedSubjectImg, shadowRect.x, shadowRect.y, shadowRect.width, shadowRect.height);

    // 6. Draw reflection (if enabled) - BEFORE drawing the clean product
    if (reflectionOptions && reflectionOptions.opacity > 0) {
      drawReflection(ctx, cleanSubjectImg, layout.reflectionRect, reflectionOptions);
    }

    // 7. Draw clean product on top
    const productRect = layout.productRect;
    ctx.drawImage(cleanSubjectImg, productRect.x, productRect.y, productRect.width, productRect.height);

    // 7. Export to blob
    return new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
  } catch (error) {
    console.error('Error during canvas compositing V2:', error);
    return null;
  }
}