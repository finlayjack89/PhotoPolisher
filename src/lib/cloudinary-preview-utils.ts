import { ShadowConfig } from "@/contexts/WorkflowContext";

/**
 * Generates a Cloudinary transformation URL for live shadow preview
 * without regenerating the actual shadow image.
 * 
 * @param cloudName - Cloudinary cloud name
 * @param publicId - Public ID of the uploaded image
 * @param shadowConfig - Shadow configuration parameters
 * @returns Transformation URL with cache-busting timestamp
 */
export function generateCloudinaryPreviewUrl(
  cloudName: string,
  publicId: string,
  shadowConfig: ShadowConfig
): string {
  const { azimuth, elevation, spread } = shadowConfig;
  
  // Calculate padding multiplier based on spread
  // Minimum 1.5x canvas size, scales with spread
  const paddingMultiplier = Math.max(1.5, 1 + (spread / 100));
  
  // Build Cloudinary transformation URL
  // c_lpad: letterbox pad to prevent cropping
  // w_iw_mul_X: multiply original width by X
  // h_ih_mul_X: multiply original height by X
  // b_transparent: transparent background
  // e_dropshadow: apply drop shadow effect with parameters
  const transformUrl = `https://res.cloudinary.com/${cloudName}/image/upload/c_lpad,w_iw_mul_${paddingMultiplier},h_ih_mul_${paddingMultiplier},b_transparent/e_dropshadow:azimuth_${azimuth};elevation_${elevation};spread_${spread}/${publicId}.png`;
  
  // Add cache-busting timestamp to force reload
  const timestamp = Date.now();
  return `${transformUrl}?t=${timestamp}`;
}

/**
 * Uploads an image to Cloudinary for preview purposes
 * Returns the public ID and cloud name for generating transformation URLs
 * 
 * @param imageData - Base64 data URL of the image
 * @param uploadEndpoint - API endpoint for uploading (default: /api/drop-shadow)
 * @returns Object with publicId and cloudName, or null on error
 */
export async function uploadPreviewToCloudinary(
  imageData: string,
  uploadEndpoint: string = '/api/add-drop-shadow'
): Promise<{ publicId: string; cloudName: string } | null> {
  try {
    const response = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uploadPreview: true,
        image: { data: imageData },
      }),
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data?.publicId && data?.cloudName) {
      return {
        publicId: data.publicId,
        cloudName: data.cloudName,
      };
    }
    
    throw new Error('No publicId returned from preview upload');
  } catch (error) {
    console.error('Preview upload failed:', error);
    return null;
  }
}
