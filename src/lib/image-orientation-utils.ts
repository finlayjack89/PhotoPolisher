// src/lib/image-orientation-utils.ts

/**
 * Read EXIF orientation from image file
 */
const getOrientation = (file: File): Promise<number> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const view = new DataView(e.target?.result as ArrayBuffer);
        
        // Check for JPEG signature
        if (view.getUint16(0, false) !== 0xFFD8) {
          console.log('Not a JPEG file, no EXIF orientation');
          resolve(1);
          return;
        }
        
        const length = view.byteLength;
        let offset = 2;
        
        while (offset < length) {
          const marker = view.getUint16(offset, false);
          offset += 2;
          
          // Check if this is an APP1 marker (EXIF data)
          if (marker === 0xFFE1) {
            // Read the size of the APP1 block
            const app1Length = view.getUint16(offset, false);
            offset += 2;
            
            // Check for "Exif" identifier
            const exifString = String.fromCharCode(
              view.getUint8(offset),
              view.getUint8(offset + 1),
              view.getUint8(offset + 2),
              view.getUint8(offset + 3)
            );
            
            if (exifString !== 'Exif') {
              offset += app1Length - 2;
              continue;
            }
            
            offset += 6; // Skip "Exif\0\0"
            
            // Check byte order
            const tiffOffset = offset;
            const byteOrder = view.getUint16(offset, false);
            const isLittleEndian = byteOrder === 0x4949;
            
            if (byteOrder !== 0x4949 && byteOrder !== 0x4D4D) {
              console.log('Invalid TIFF byte order');
              resolve(1);
              return;
            }
            
            // Skip to IFD offset
            offset += 2;
            const ifdOffset = view.getUint32(offset, isLittleEndian);
            offset = tiffOffset + ifdOffset;
            
            // Read number of directory entries
            const numEntries = view.getUint16(offset, isLittleEndian);
            offset += 2;
            
            // Search for orientation tag (0x0112)
            for (let i = 0; i < numEntries; i++) {
              const entryOffset = offset + i * 12;
              const tag = view.getUint16(entryOffset, isLittleEndian);
              
              if (tag === 0x0112) {
                const orientation = view.getUint16(entryOffset + 8, isLittleEndian);
                console.log(`Found EXIF orientation: ${orientation}`);
                resolve(orientation);
                return;
              }
            }
            
            console.log('No orientation tag found in EXIF');
            resolve(1);
            return;
          } else if (marker >= 0xFFD0 && marker <= 0xFFD9) {
            // Skip over restart markers and start/end of image
            continue;
          } else if (marker === 0xFF01) {
            // Skip over TEM marker
            continue;
          } else if ((marker & 0xFF00) === 0xFF00) {
            // Read the length of the current segment
            if (offset + 2 > length) break;
            const segmentLength = view.getUint16(offset, false);
            offset += segmentLength;
          } else {
            // Invalid marker
            break;
          }
        }
        
        console.log('Reached end of JPEG without finding orientation');
        resolve(1);
      } catch (error) {
        console.error('Error reading EXIF orientation:', error);
        resolve(1);
      }
    };
    reader.onerror = () => {
      console.error('FileReader error');
      resolve(1);
    };
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Apply orientation transformation to canvas context
 */
export const applyOrientation = (
  ctx: CanvasRenderingContext2D,
  orientation: number,
  width: number,
  height: number
) => {
  switch (orientation) {
    case 2:
      // Horizontal flip
      ctx.transform(-1, 0, 0, 1, width, 0);
      break;
    case 3:
      // 180° rotation
      ctx.transform(-1, 0, 0, -1, width, height);
      break;
    case 4:
      // Vertical flip
      ctx.transform(1, 0, 0, -1, 0, height);
      break;
    case 5:
      // Vertical flip + 90° CW
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      // 90° CW
      ctx.transform(0, 1, -1, 0, height, 0);
      break;
    case 7:
      // Horizontal flip + 90° CW
      ctx.transform(0, -1, -1, 0, height, width);
      break;
    case 8:
      // 90° CCW
      ctx.transform(0, -1, 1, 0, 0, width);
      break;
    default:
      // No transformation needed
      break;
  }
};

/**
 * AUTO-DESKEW BASELINE DETECTION
 * Sophisticated algorithm to detect and straighten tilted product images
 */

export interface DeskewResult {
  rotatedDataUrl: string | null;
  cleanRotatedDataUrl: string | null;
  angle: number;
  confidence: number;
  reason?: string;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Apply morphological closing operation (dilation followed by erosion)
 * Smooths bumps and fills small gaps
 */
const morphologicalClosing = (imageData: ImageData, radius: number): ImageData => {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  
  const dilated = new Uint8ClampedArray(data.length);
  const eroded = new Uint8ClampedArray(data.length);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let maxAlpha = 0;
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy <= radius * radius) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nidx = (ny * width + nx) * 4;
              maxAlpha = Math.max(maxAlpha, data[nidx + 3]);
            }
          }
        }
      }
      
      dilated[idx] = data[idx];
      dilated[idx + 1] = data[idx + 1];
      dilated[idx + 2] = data[idx + 2];
      dilated[idx + 3] = maxAlpha;
    }
  }
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let minAlpha = 255;
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy <= radius * radius) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nidx = (ny * width + nx) * 4;
              minAlpha = Math.min(minAlpha, dilated[nidx + 3]);
            }
          }
        }
      }
      
      eroded[idx] = dilated[idx];
      eroded[idx + 1] = dilated[idx + 1];
      eroded[idx + 2] = dilated[idx + 2];
      eroded[idx + 3] = minAlpha;
    }
  }
  
  for (let i = 0; i < result.data.length; i++) {
    result.data[i] = eroded[i];
  }
  
  return result;
};

/**
 * Find connected components and return only the largest one (main product)
 * Filters out accessories, straps, tags
 */
const getMainComponent = (imageData: ImageData, minAreaThreshold: number = 0.08): ImageData => {
  const { width, height, data } = imageData;
  const visited = new Uint8Array(width * height);
  const components: number[][] = [];
  
  const floodFill = (startX: number, startY: number): number[] => {
    const pixels: number[] = [];
    const stack: Point[] = [{ x: startX, y: startY }];
    
    while (stack.length > 0) {
      const { x, y } = stack.pop()!;
      const idx = y * width + x;
      
      if (x < 0 || x >= width || y < 0 || y >= height || visited[idx]) continue;
      
      const pixelIdx = idx * 4;
      if (data[pixelIdx + 3] < 20) continue;
      
      visited[idx] = 1;
      pixels.push(idx);
      
      stack.push({ x: x + 1, y });
      stack.push({ x: x - 1, y });
      stack.push({ x, y: y + 1 });
      stack.push({ x, y: y - 1 });
    }
    
    return pixels;
  };
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!visited[idx] && data[idx * 4 + 3] >= 20) {
        const component = floodFill(x, y);
        if (component.length > 0) {
          components.push(component);
        }
      }
    }
  }
  
  if (components.length === 0) return imageData;
  
  components.sort((a, b) => b.length - a.length);
  const mainComponent = components[0];
  const totalPixels = width * height;
  const areaThreshold = totalPixels * minAreaThreshold;
  
  const result = new ImageData(width, height);
  const mainComponentSet = new Set(mainComponent);
  
  for (let i = 0; i < data.length; i += 4) {
    const pixelIdx = i / 4;
    if (mainComponentSet.has(pixelIdx)) {
      result.data[i] = data[i];
      result.data[i + 1] = data[i + 1];
      result.data[i + 2] = data[i + 2];
      result.data[i + 3] = data[i + 3];
    } else {
      result.data[i + 3] = 0;
    }
  }
  
  return result;
};

/**
 * Sample points from the bottom band of the image with center weighting
 */
const sampleBottomBand = (
  imageData: ImageData,
  bandHeightPercent: number = 0.08
): Point[] => {
  const { width, height, data } = imageData;
  const bandHeight = Math.max(3, Math.floor(height * bandHeightPercent));
  const startY = height - bandHeight;
  
  const points: Point[] = [];
  
  for (let x = 0; x < width; x++) {
    let lowestY = -1;
    
    for (let y = startY; y < height; y++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] >= 20) {
        lowestY = y;
      }
    }
    
    if (lowestY >= 0) {
      const centerWeight = 1 + Math.cos((x / width - 0.5) * Math.PI);
      const weight = Math.round(centerWeight);
      for (let i = 0; i < weight; i++) {
        points.push({ x, y: lowestY });
      }
    }
  }
  
  return points;
};

/**
 * Fit a line using RANSAC (robust to outliers)
 */
const fitLineRANSAC = (
  points: Point[],
  iterations: number = 200,
  threshold: number = 2.5
): { slope: number; intercept: number; inliers: Point[]; confidence: number } | null => {
  if (points.length < 10) return null;
  
  let bestSlope = 0;
  let bestIntercept = 0;
  let bestInliers: Point[] = [];
  
  for (let iter = 0; iter < iterations; iter++) {
    const idx1 = Math.floor(Math.random() * points.length);
    let idx2 = Math.floor(Math.random() * points.length);
    while (idx2 === idx1) {
      idx2 = Math.floor(Math.random() * points.length);
    }
    
    const p1 = points[idx1];
    const p2 = points[idx2];
    
    if (Math.abs(p2.x - p1.x) < 1) continue;
    
    const slope = (p2.y - p1.y) / (p2.x - p1.x);
    const intercept = p1.y - slope * p1.x;
    
    const inliers: Point[] = [];
    for (const point of points) {
      const expectedY = slope * point.x + intercept;
      const residual = Math.abs(point.y - expectedY);
      if (residual <= threshold) {
        inliers.push(point);
      }
    }
    
    if (inliers.length > bestInliers.length) {
      bestSlope = slope;
      bestIntercept = intercept;
      bestInliers = inliers;
    }
  }
  
  if (bestInliers.length === 0) return null;
  
  const inlierRatio = bestInliers.length / points.length;
  
  let sumResiduals = 0;
  for (const point of bestInliers) {
    const expectedY = bestSlope * point.x + bestIntercept;
    sumResiduals += Math.abs(point.y - expectedY);
  }
  const avgResidual = sumResiduals / bestInliers.length;
  
  const residualScore = Math.max(0, 1 - avgResidual / threshold);
  const confidence = (inlierRatio * 0.6 + residualScore * 0.4) * 100;
  
  return {
    slope: bestSlope,
    intercept: bestIntercept,
    inliers: bestInliers,
    confidence
  };
};

/**
 * Auto-deskew a product image by detecting and straightening its baseline
 */
export const autoDeskewSubject = async (
  imageDataUrl: string,
  cleanImageDataUrl?: string
): Promise<DeskewResult> => {
  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        if (!ctx) {
          resolve({ rotatedDataUrl: null, cleanRotatedDataUrl: null, angle: 0, confidence: 0, reason: 'Failed to get canvas context' });
          return;
        }
        
        ctx.drawImage(img, 0, 0);
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        imageData = morphologicalClosing(imageData, 3);
        imageData = getMainComponent(imageData, 0.08);
        
        const points = sampleBottomBand(imageData, 0.08);
        
        if (points.length < 10) {
          resolve({ 
            rotatedDataUrl: null, 
            cleanRotatedDataUrl: null, 
            angle: 0, 
            confidence: 0, 
            reason: 'Insufficient baseline points detected' 
          });
          return;
        }
        
        const lineResult = fitLineRANSAC(points, 200, 2.5);
        
        if (!lineResult) {
          resolve({ 
            rotatedDataUrl: null, 
            cleanRotatedDataUrl: null, 
            angle: 0, 
            confidence: 0, 
            reason: 'Could not fit baseline' 
          });
          return;
        }
        
        const { slope, inliers, confidence: rawConfidence } = lineResult;
        
        const angleRadians = Math.atan(slope);
        const angleDegrees = -(angleRadians * 180) / Math.PI;
        
        const xMin = Math.min(...inliers.map(p => p.x));
        const xMax = Math.max(...inliers.map(p => p.x));
        const baselineWidth = xMax - xMin;
        const widthRatio = baselineWidth / img.width;
        
        let confidence = rawConfidence;
        if (widthRatio < 0.4) confidence *= 0.5;
        if (Math.abs(angleDegrees) > 8) confidence *= 0.6;
        
        const confidenceThreshold = 75;
        const angleThreshold = 10;
        
        if (confidence < confidenceThreshold || Math.abs(angleDegrees) > angleThreshold) {
          let reason = 'Auto-straighten skipped: ';
          if (confidence < confidenceThreshold) reason += 'low confidence (curved/round base detected)';
          else reason += 'extreme angle detected';
          
          resolve({ 
            rotatedDataUrl: null, 
            cleanRotatedDataUrl: null, 
            angle: angleDegrees, 
            confidence, 
            reason 
          });
          return;
        }
        
        const rotateImageByAngle = (imageUrl: string, degrees: number): Promise<string> => {
          return new Promise((rotResolve, rotReject) => {
            const rotImg = new Image();
            rotImg.onload = () => {
              const rads = (degrees * Math.PI) / 180;
              const cos = Math.abs(Math.cos(rads));
              const sin = Math.abs(Math.sin(rads));
              
              const newWidth = Math.ceil(rotImg.width * cos + rotImg.height * sin);
              const newHeight = Math.ceil(rotImg.width * sin + rotImg.height * cos);
              
              const rotCanvas = document.createElement('canvas');
              rotCanvas.width = newWidth;
              rotCanvas.height = newHeight;
              const rotCtx = rotCanvas.getContext('2d');
              
              if (!rotCtx) {
                rotReject(new Error('Failed to get rotation context'));
                return;
              }
              
              rotCtx.clearRect(0, 0, newWidth, newHeight);
              rotCtx.save();
              rotCtx.translate(newWidth / 2, newHeight / 2);
              rotCtx.rotate(rads);
              rotCtx.drawImage(rotImg, -rotImg.width / 2, -rotImg.height / 2);
              rotCtx.restore();
              
              const result = rotCanvas.toDataURL('image/png');
              
              // Clean up rotation canvas to free memory
              rotCanvas.width = 0;
              rotCanvas.height = 0;
              
              rotResolve(result);
            };
            rotImg.onerror = () => rotReject(new Error('Failed to load image for rotation'));
            rotImg.src = imageUrl;
          });
        };
        
        const rotatedDataUrl = await rotateImageByAngle(imageDataUrl, angleDegrees);
        const cleanRotatedDataUrl = cleanImageDataUrl 
          ? await rotateImageByAngle(cleanImageDataUrl, angleDegrees)
          : null;
        
        // Clean up main analysis canvas to free memory
        canvas.width = 0;
        canvas.height = 0;
        
        resolve({
          rotatedDataUrl,
          cleanRotatedDataUrl,
          angle: angleDegrees,
          confidence,
          reason: `Straightened by ${angleDegrees.toFixed(1)}°`
        });
        
      } catch (error) {
        console.error('Error in autoDeskewSubject:', error);
        resolve({ 
          rotatedDataUrl: null, 
          cleanRotatedDataUrl: null, 
          angle: 0, 
          confidence: 0, 
          reason: 'Processing error' 
        });
      }
    };
    
    img.onerror = () => {
      resolve({ 
        rotatedDataUrl: null, 
        cleanRotatedDataUrl: null, 
        angle: 0, 
        confidence: 0, 
        reason: 'Failed to load image' 
      });
    };
    
    img.src = imageDataUrl;
  });
};

/**
 * Correct image orientation by reading EXIF data and applying proper transformation
 */
export const correctImageOrientation = async (file: File): Promise<File> => {
  try {
    console.log(`[ORIENTATION] Processing: ${file.name} (${file.type})`);
    
    // Get EXIF orientation
    const orientation = await getOrientation(file);
    console.log(`[ORIENTATION] EXIF value: ${orientation}`);
    
    // If orientation is 1 (normal) or undefined, no correction needed
    if (!orientation || orientation === 1) {
      console.log('[ORIENTATION] No correction needed');
      return file;
    }
    
    // Load image using Image element to get actual dimensions
    const img = new Image();
    const imageLoadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
    
    const loadedImg = await imageLoadPromise;
    const originalWidth = loadedImg.naturalWidth;
    const originalHeight = loadedImg.naturalHeight;
    
    console.log(`[ORIENTATION] Original dimensions: ${originalWidth}x${originalHeight}`);
    
    // Create canvas with proper dimensions
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: true });
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    // Set canvas dimensions based on orientation
    if (orientation >= 5 && orientation <= 8) {
      // For 90° or 270° rotations, swap width and height
      canvas.width = originalHeight;
      canvas.height = originalWidth;
      console.log(`[ORIENTATION] Canvas dimensions (swapped): ${canvas.width}x${canvas.height}`);
    } else {
      canvas.width = originalWidth;
      canvas.height = originalHeight;
      console.log(`[ORIENTATION] Canvas dimensions: ${canvas.width}x${canvas.height}`);
    }
    
    // Apply orientation transformation
    console.log(`[ORIENTATION] Applying transformation for orientation ${orientation}`);
    applyOrientation(ctx, orientation, originalWidth, originalHeight);
    
    // Draw image with correct orientation
    ctx.drawImage(loadedImg, 0, 0);
    
    // Clean up object URL
    URL.revokeObjectURL(img.src);
    
    // Convert canvas to blob with maximum quality
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) {
            resolve(b);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        file.type.startsWith('image/') ? file.type : 'image/png',
        1.0
      );
    });
    
    console.log(`[ORIENTATION] Blob created: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
    
    // Create new file with corrected orientation
    const correctedFile = new File([blob], file.name, {
      type: blob.type,
      lastModified: Date.now(),
    });
    
    // Clean up canvas to free memory
    canvas.width = 0;
    canvas.height = 0;
    
    console.log(`[ORIENTATION] ✓ Corrected from orientation ${orientation} to 1`);
    return correctedFile;
  } catch (error) {
    console.error('[ORIENTATION] Error correcting orientation:', error);
    return file; // Return original file if correction fails
  }
};
