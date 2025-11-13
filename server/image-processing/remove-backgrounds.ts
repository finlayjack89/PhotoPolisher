import fetch from 'node-fetch';

interface RemoveBackgroundRequest {
  images: Array<{
    data: string;
    name: string;
  }>;
}

export async function removeBackgrounds(req: RemoveBackgroundRequest) {
  const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
  
  if (!REPLICATE_API_KEY) {
    throw new Error('REPLICATE_API_KEY is not configured');
  }

  const { images } = req;
  console.log(`Processing ${images.length} images for background removal`);

  const processedImages = [];

  for (const image of images) {
    try {
      console.log(`Removing background from: ${image.name}`);

      const response = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: 'fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',
          input: {
            image: image.data,
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Replicate API error for ${image.name}:`, errorText);
        throw new Error(`Replicate API error: ${response.status}`);
      }

      const prediction = await response.json() as any;
      console.log(`Prediction started for ${image.name}:`, prediction.id);

      let result = prediction;
      while (result.status === 'starting' || result.status === 'processing') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
          headers: {
            'Authorization': `Bearer ${REPLICATE_API_KEY}`,
          },
        });
        
        result = await statusResponse.json() as any;
        console.log(`Status for ${image.name}:`, result.status);
      }

      if (result.status === 'succeeded' && result.output) {
        const outputUrl = result.output;
        const imageResponse = await fetch(outputUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(imageBuffer).toString('base64');
        const transparentDataUrl = `data:image/png;base64,${base64}`;
        
        processedImages.push({
          name: image.name,
          transparentData: transparentDataUrl,
          size: imageBuffer.byteLength,
        });
        
        console.log(`✅ Successfully removed background from ${image.name} (${imageBuffer.byteLength} bytes)`);
      } else {
        throw new Error(`Background removal failed: ${result.status}`);
      }

    } catch (error) {
      console.error(`Error processing ${image.name}:`, error);
      
      // Calculate size from the original base64 data
      // Remove data URL prefix if present (e.g., "data:image/png;base64,")
      const base64String = image.data.includes(',') ? image.data.split(',')[1] : image.data;
      const estimatedBytes = Math.ceil((base64String.length * 3) / 4);
      
      processedImages.push({
        name: image.name,
        transparentData: image.data,
        size: estimatedBytes,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    success: true,
    images: processedImages,
  };
}
