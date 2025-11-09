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
    
    console.log(`[ORIENTATION] ✓ Corrected from orientation ${orientation} to 1`);
    return correctedFile;
  } catch (error) {
    console.error('[ORIENTATION] Error correcting orientation:', error);
    return file; // Return original file if correction fails
  }
};
