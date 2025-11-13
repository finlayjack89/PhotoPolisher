import fetch from 'node-fetch';
import FormData from 'form-data';
import crypto from 'crypto';

export interface AddDropShadowRequest {
  images?: Array<{
    data: string;
    name: string;
  }>;
  uploadPreview?: boolean;
  image?: { data: string };
  azimuth?: number;
  elevation?: number;
  spread?: number;
  opacity?: number;
}

async function generateSignature(stringToSign: string, apiSecret: string): Promise<string> {
  return crypto.createHash('sha1').update(stringToSign).digest('hex');
}

export async function addDropShadow(req: AddDropShadowRequest) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials not configured');
  }

  const { images, uploadPreview, image, azimuth = 0, elevation = 90, spread = 5, opacity = 75 } = req; // <-- ADDED opacity

  // Handle preview upload
  if (uploadPreview && image) {
    console.log('Uploading preview image to Cloudinary...');

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'shadow_preview_temp';
    const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const uploadSignature = await generateSignature(signatureString, apiSecret);

    const uploadData = new FormData();
    uploadData.append('file', image.data);
    uploadData.append('api_key', apiKey);
    uploadData.append('timestamp', timestamp.toString());
    uploadData.append('signature', uploadSignature);
    uploadData.append('folder', folder);

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        body: uploadData,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Preview upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const uploadResult = await uploadResponse.json() as any;
    console.log('✅ Preview uploaded:', uploadResult.public_id);

    return {
      success: true,
      publicId: uploadResult.public_id,
      cloudName: cloudName
    };
  }

  if (!images || !Array.isArray(images) || images.length === 0) {
    throw new Error('No images provided');
  }

  console.log(`Processing ${images.length} images for drop shadow with params: azimuth=${azimuth}, elevation=${elevation}, spread=${spread}, opacity=${opacity}`); // <-- ADDED opacity log

  const processedImages = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    console.log(`Processing image ${i + 1}/${images.length}: ${img.name}`);

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const folder = 'drop_shadow_temp';
      const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
      const uploadSignature = await generateSignature(signatureString, apiSecret);

      const uploadData = new FormData();
      uploadData.append('file', img.data);
      uploadData.append('api_key', apiKey);
      uploadData.append('timestamp', timestamp.toString());
      uploadData.append('signature', uploadSignature);
      uploadData.append('folder', folder);

      console.log(`Uploading ${img.name} to Cloudinary with signed upload...`);

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: 'POST',
          body: uploadData,
        }
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(`Upload failed for ${img.name}:`, errorText);
        throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
      }

      const uploadResult = await uploadResponse.json() as any;
      console.log(`✅ Uploaded ${img.name} to Cloudinary:`, uploadResult.public_id);

      const paddingMultiplier = Math.max(1.5, 1 + (spread / 100));
      console.log(`Using padding multiplier: ${paddingMultiplier}x for spread: ${spread}`);

      // --- MODIFIED LINE ---
      // Added opacity (co_rgb:000,o_OPACITY) to the drop shadow effect
      const transformedUrl = `https://res.cloudinary.com/${cloudName}/image/upload/c_lpad,w_iw_mul_${paddingMultiplier},h_ih_mul_${paddingMultiplier},b_transparent/e_dropshadow:azimuth_${azimuth};elevation_${elevation};spread_${spread},co_rgb:000,o_${opacity}/${uploadResult.public_id}.png`;
      // --- END MODIFIED LINE ---

      console.log(`Transformation URL: ${transformedUrl}`);

      const transformedResponse = await fetch(transformedUrl);

      if (!transformedResponse.ok) {
        throw new Error(`Failed to fetch transformed image: ${transformedResponse.status}`);
      }

      const transformedBuffer = await transformedResponse.arrayBuffer();
      const base64 = Buffer.from(transformedBuffer).toString('base64');

      const shadowedDataUrl = `data:image/png;base64,${base64}`;

      processedImages.push({
        name: img.name,
        shadowedData: shadowedDataUrl,
      });

      console.log(`✅ Successfully added shadow to ${img.name}`);

      // Cleanup
      try {
        const deleteTimestamp = Math.floor(Date.now() / 1000);
        const deleteSignatureString = `public_id=${uploadResult.public_id}&timestamp=${deleteTimestamp}${apiSecret}`;
        const deleteSignature = await generateSignature(deleteSignatureString, apiSecret);

        const deleteData = new FormData();
        deleteData.append('public_id', uploadResult.public_id);
        deleteData.append('signature', deleteSignature);
        deleteData.append('api_key', apiKey);
        deleteData.append('timestamp', deleteTimestamp.toString());

        const deleteResponse = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
          {
            method: 'POST',
            body: deleteData,
          }
        );

        if (deleteResponse.ok) {
          console.log(`🗑️ Cleaned up temporary Cloudinary image: ${uploadResult.public_id}`);
        }
      } catch (cleanupError) {
        console.warn('Failed to cleanup Cloudinary image:', cleanupError);
      }

    } catch (imageError) {
      console.error(`Failed to process ${img.name}:`, imageError);
      processedImages.push({
        name: img.name,
        shadowedData: img.data,
        error: imageError instanceof Error ? imageError.message : 'Unknown error',
      });
    }
  }

  return {
    success: true,
    images: processedImages
  };
}