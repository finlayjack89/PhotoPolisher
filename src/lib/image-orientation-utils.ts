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
 * Detect object bounds by scanning alpha channel
 */
const detectObjectBounds = (imageData: ImageData): { minY: number; maxY: number; minX: number; maxX: number } | null => {
  const { width, height, data } = imageData;
  let minY = height, maxY = 0, minX = width, maxX = 0;
  let hasContent = false;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] > 200) {
        hasContent = true;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  
  return hasContent ? { minY, maxY, minX, maxX } : null;
};

/**
 * Find bottom contour points using column scanning
 */
const findBottomContour = (imageData: ImageData, bounds: { minY: number; maxY: number; minX: number; maxX: number }): Point[] => {
  const { width, height, data } = imageData;
  const points: Point[] = [];
  
  for (let x = bounds.minX; x <= bounds.maxX; x++) {
    let bottomY = -1;
    
    for (let y = bounds.maxY; y >= bounds.minY; y--) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] > 200) {
        bottomY = y;
        break;
      }
    }
    
    if (bottomY >= 0) {
      points.push({ x, y: bottomY });
    }
  }
  
  return points;
};

/**
 * Smart RANSAC with center weighting to avoid rounded corners
 */
const fitBaselineRANSAC = (points: Point[]): { angle: number; consensus: number } | null => {
  if (points.length < 20) {
    console.log('[DESKEW] Too few points:', points.length);
    return null;
  }
  
  points.sort((a, b) => a.x - b.x);
  const trimCount = Math.floor(points.length * 0.15);
  const centerPoints = points.slice(trimCount, points.length - trimCount);
  
  console.log(`[DESKEW] Points: total=${points.length}, after corner filtering=${centerPoints.length}`);
  
  if (centerPoints.length < 10) {
    console.log('[DESKEW] Too few center points after filtering');
    return null;
  }
  
  let bestSlope = 0;
  let bestIntercept = 0;
  let bestInliers = 0;
  
  const ITERATIONS = 200;
  const INLIER_THRESHOLD = 5;
  
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const idx1 = Math.floor(Math.random() * centerPoints.length);
    let idx2 = Math.floor(Math.random() * centerPoints.length);
    while (idx2 === idx1) {
      idx2 = Math.floor(Math.random() * centerPoints.length);
    }
    
    const p1 = centerPoints[idx1];
    const p2 = centerPoints[idx2];
    
    if (Math.abs(p2.x - p1.x) < 1) continue;
    
    const slope = (p2.y - p1.y) / (p2.x - p1.x);
    const intercept = p1.y - slope * p1.x;
    
    let inlierCount = 0;
    for (const point of centerPoints) {
      const expectedY = slope * point.x + intercept;
      const residual = Math.abs(point.y - expectedY);
      if (residual <= INLIER_THRESHOLD) {
        inlierCount++;
      }
    }
    
    if (inlierCount > bestInliers) {
      bestSlope = slope;
      bestIntercept = intercept;
      bestInliers = inlierCount;
    }
  }
  
  const consensus = bestInliers / centerPoints.length;
  console.log(`[DESKEW] RANSAC: inliers=${bestInliers}/${centerPoints.length} (${(consensus * 100).toFixed(1)}%)`);
  
  if (consensus < 0.25) {
    console.log('[DESKEW] Insufficient consensus, likely circular or irregular object');
    return null;
  }
  
  const angleRadians = Math.atan(bestSlope);
  const angleDegrees = -(angleRadians * 180) / Math.PI;
  
  return { angle: angleDegrees, consensus };
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
        const analysisMaxWidth = 600;
        const scale = Math.min(1, analysisMaxWidth / img.width);
        const analysisWidth = Math.floor(img.width * scale);
        const analysisHeight = Math.floor(img.height * scale);
        
        console.log(`[DESKEW] Original: ${img.width}x${img.height}, Analysis: ${analysisWidth}x${analysisHeight}`);
        
        const canvas = document.createElement('canvas');
        canvas.width = analysisWidth;
        canvas.height = analysisHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        if (!ctx) {
          resolve({ rotatedDataUrl: null, cleanRotatedDataUrl: null, angle: 0, confidence: 0, reason: 'Failed to get canvas context' });
          return;
        }
        
        ctx.drawImage(img, 0, 0, analysisWidth, analysisHeight);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        const bounds = detectObjectBounds(imageData);
        if (!bounds) {
          resolve({ 
            rotatedDataUrl: null, 
            cleanRotatedDataUrl: null, 
            angle: 0, 
            confidence: 0, 
            reason: 'No object detected in image' 
          });
          return;
        }
        
        console.log(`[DESKEW] Object bounds: y=${bounds.minY}-${bounds.maxY}, x=${bounds.minX}-${bounds.maxX}`);
        
        const bottomPoints = findBottomContour(imageData, bounds);
        console.log(`[DESKEW] Bottom contour points: ${bottomPoints.length}`);
        
        if (bottomPoints.length < 20) {
          resolve({ 
            rotatedDataUrl: null, 
            cleanRotatedDataUrl: null, 
            angle: 0, 
            confidence: 0, 
            reason: `Insufficient bottom edge detected (${bottomPoints.length} points)` 
          });
          return;
        }
        
        const baseline = fitBaselineRANSAC(bottomPoints);
        
        if (!baseline) {
          resolve({ 
            rotatedDataUrl: null, 
            cleanRotatedDataUrl: null, 
            angle: 0, 
            confidence: 0, 
            reason: 'Could not fit baseline (likely circular or irregular base)' 
          });
          return;
        }
        
        const { angle: calculatedAngle, consensus } = baseline;
        console.log(`[DESKEW] Calculated angle: ${calculatedAngle.toFixed(2)}°, consensus: ${(consensus * 100).toFixed(1)}%`);
        
        const MAX_ROTATION = 15;
        if (Math.abs(calculatedAngle) > MAX_ROTATION) {
          resolve({ 
            rotatedDataUrl: null, 
            cleanRotatedDataUrl: null, 
            angle: calculatedAngle, 
            confidence: consensus * 100, 
            reason: `Angle too extreme (${calculatedAngle.toFixed(1)}° > ${MAX_ROTATION}°), skipping rotation` 
          });
          return;
        }
        
        if (Math.abs(calculatedAngle) < 0.5) {
          resolve({ 
            rotatedDataUrl: null, 
            cleanRotatedDataUrl: null, 
            angle: calculatedAngle, 
            confidence: consensus * 100, 
            reason: 'Image already straight (angle < 0.5°)' 
          });
          return;
        }
        
        const rotateImage = (imageUrl: string, degrees: number): Promise<string> => {
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
              
              rotCanvas.width = 0;
              rotCanvas.height = 0;
              
              rotResolve(result);
            };
            rotImg.onerror = () => rotReject(new Error('Failed to load image for rotation'));
            rotImg.src = imageUrl;
          });
        };
        
        const rotatedDataUrl = await rotateImage(imageDataUrl, calculatedAngle);
        const cleanRotatedDataUrl = cleanImageDataUrl 
          ? await rotateImage(cleanImageDataUrl, calculatedAngle)
          : null;
        
        canvas.width = 0;
        canvas.height = 0;
        
        console.log(`[DESKEW] ✓ Straightened by ${calculatedAngle.toFixed(1)}° (${(consensus * 100).toFixed(1)}% consensus)`);
        
        resolve({
          rotatedDataUrl,
          cleanRotatedDataUrl,
          angle: calculatedAngle,
          confidence: consensus * 100,
          reason: `Straightened by ${calculatedAngle.toFixed(1)}°`
        });
        
      } catch (error) {
        console.error('[DESKEW] Error:', error);
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
