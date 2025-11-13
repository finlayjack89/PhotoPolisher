// src/lib/api-client.ts

/**
 * Generic API request helper
 */
export async function apiRequest<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `API request failed: ${response.status}`);
  }

  // Handle 202 Accepted (for job creation)
  if (response.status === 202) {
    return response.json();
  }

  // Handle 200 OK
  return response.json();
}

export const api = {
  // --- Original processing endpoints ---
  removeBackgrounds: (data: any) => apiRequest('/api/remove-backgrounds', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * Single-file background removal helper
   * Converts a File to base64 and calls the removeBackgrounds endpoint
   */
  removeBackground: async (file: File): Promise<{ success: boolean; images: Array<{ name: string; transparentData: string; size: number; error?: string }> }> => {
    // Convert File to base64 data URL
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Call the removeBackgrounds endpoint with single image
    return apiRequest('/api/remove-backgrounds', {
      method: 'POST',
      body: JSON.stringify({
        images: [{
          data: base64Data,
          name: file.name,
        }],
      }),
    });
  },

  addDropShadow: (data: any) => apiRequest('/api/add-drop-shadow', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // --- NEW ASYNC JOB ENDPOINTS ---

  /**
   * Refactored: Starts the server-side processing job.
   * @returns {jobId: string}
   */
  processImage: async (
    original_image_url: string, // This is the cleanCutoutDataUrl
    processing_options: any,
  ): Promise<{ jobId: string }> => {
    return apiRequest('/api/process-image', {
      method: 'POST',
      body: JSON.stringify({ original_image_url, processing_options }),
    });
  },

  /**
   * New: Polls for job status.
   */
  getJobStatus: async (
    jobId: string,
  ): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    final_image_url?: string;
    error_message?: string;
  }> => {
    return apiRequest(`/api/job-status/${jobId}`, {
      method: 'GET',
    });
  },

  // --- Other endpoints ---

  compressImages: (data: any) => apiRequest('/api/compress-images', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  analyzeImages: (data: any) => apiRequest('/api/analyze-images', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  upscaleImages: (data: any) => apiRequest('/api/upscale-images', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  finalizeImage: (data: any) => apiRequest('/api/finalize-image', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  generateMasks: (data: any) => apiRequest('/api/generate-masks', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  convertFileToPng: (data: any) => apiRequest('/api/convert-file-to-png', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

/**
 * Upload a backdrop file (two-step process)
 * Step 1: Upload file to /api/upload to get storage URL
 * Step 2: Create backdrop entry in database with metadata
 * @returns The created backdrop object from the server
 */
export async function uploadBackdrop(formData: FormData): Promise<any> {
  // Step 1: Upload the file itself
  const fileFormData = new FormData();
  const imageFile = formData.get('image');
  
  if (!imageFile) {
    throw new Error('No image file provided');
  }
  
  // Ensure we have a File or Blob object
  let fileToUpload: File;
  if (imageFile as any instanceof File) {
    fileToUpload = imageFile as File;
  } else if (imageFile as any instanceof Blob) {
    // Wrap Blob in File with a default name
    const blob = imageFile as Blob;
    fileToUpload = new File([blob], 'backdrop.png', { type: blob.type || 'image/png' });
  } else {
    throw new Error('Image must be a File or Blob object');
  }
  
  fileFormData.append('file', fileToUpload);
  
  const uploadResponse = await fetch('/api/upload', {
    method: 'POST',
    body: fileFormData,
  });
  
  // Read response body once
  const responseText = await uploadResponse.text();
  
  if (!uploadResponse.ok) {
    let error;
    try {
      error = responseText ? JSON.parse(responseText) : { error: 'Upload failed' };
    } catch {
      error = { error: 'Upload failed' };
    }
    throw new Error(error.error || `File upload failed: ${uploadResponse.status}`);
  }
  
  // Parse success response
  let uploadResult;
  try {
    uploadResult = JSON.parse(responseText);
  } catch {
    throw new Error('Invalid response from upload endpoint');
  }
  
  const storagePath = uploadResult.url;
  
  if (!storagePath) {
    throw new Error('Upload response missing URL');
  }
  
  // Step 2: Create backdrop entry in database with validation
  const name = formData.get('name');
  const userId = formData.get('userId');
  const widthStr = formData.get('width');
  const heightStr = formData.get('height');
  
  if (!name || !userId) {
    throw new Error('Missing required fields: name or userId');
  }
  
  const width = widthStr ? parseInt(widthStr as string) : undefined;
  const height = heightStr ? parseInt(heightStr as string) : undefined;
  
  if (width !== undefined && isNaN(width)) {
    throw new Error('Invalid width value');
  }
  if (height !== undefined && isNaN(height)) {
    throw new Error('Invalid height value');
  }
  
  const backdropData = {
    name: name as string,
    userId: userId as string,
    storagePath: storagePath,
    width: width || 1920,  // Use defaults if not provided
    height: height || 1080,
  };
  
  return apiRequest('/api/backdrops', {
    method: 'POST',
    body: JSON.stringify(backdropData),
  });
}