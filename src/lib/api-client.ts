// src/lib/api-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient();

/**
 * Generic API request helper with timeout support (Phase 1 stabilization)
 */
export async function apiRequest<T = any>(
  endpoint: string, 
  options?: RequestInit & { timeout?: number }
): Promise<T> {
  const timeout = options?.timeout || 60000; // 60s default timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(endpoint, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    clearTimeout(timeoutId);

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
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

export const api = {
  // DEPRECATED: Old synchronous background removal endpoints (Nov 14, 2025)
  // These call /api/remove-backgrounds which blocks Node.js event loop
  // Replaced with job-based API: createBackgroundRemovalJob + polling
  /*
  removeBackgrounds: (data: any) => apiRequest('/api/remove-backgrounds', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  removeBackground: async (file: File): Promise<{ success: boolean; images: Array<{ name: string; transparentData: string; size: number; error?: string }> }> => {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

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
  */

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

  // COMMENTED OUT: TinyPNG compression (Phase 1 stabilization)
  // Client-side compression already handles this
  // compressImages: (data: any) => apiRequest('/api/compress-images', {
  //   method: 'POST',
  //   body: JSON.stringify(data),
  // }),

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

  /**
   * Analyze backdrop image to detect floor position using AI
   * @param formData FormData containing the backdrop image
   * @returns Object with floorY coordinate (0-1, where 0 is top, 1 is bottom)
   */
  analyzeBackdrop: async (formData: FormData): Promise<{ floorY: number }> => {
    const response = await fetch('/api/analyze-backdrop', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Backdrop analysis failed' }));
      throw new Error(error.error || `Backdrop analysis failed: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Delete a file from storage by file ID
   * Used for cleanup after workflow completion (Phase 1 stabilization)
   * @param fileId The file ID to delete
   * @returns Success status
   */
  deleteFile: async (fileId: string): Promise<{ success: boolean }> => {
    return apiRequest(`/api/files/${fileId}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Upload a file to the server
 * @param file The file to upload
 * @returns Object containing fileId and other metadata
 */
export async function uploadFile(file: File): Promise<{ id: string; fileId: string; url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  
  const uploadResponse = await fetch('/api/files', {
    method: 'POST',
    body: formData,
  });
  
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
  
  let uploadResult;
  try {
    uploadResult = JSON.parse(responseText);
  } catch {
    throw new Error('Invalid response from file service');
  }
  
  const fileId = uploadResult.fileId;
  
  if (!fileId) {
    throw new Error('File service response missing file ID');
  }
  
  // Return in a format that's easy to use
  return {
    id: fileId,
    fileId: fileId,
    url: uploadResult.url || `/api/files/${fileId}`,
  };
}

/**
 * Upload a backdrop file (two-step process)
 * Step 1: Upload file to /api/upload to get BOTH legacy path and new file ID
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
  
  const uploadResponse = await fetch('/api/files', {
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
    throw new Error('Invalid response from file service');
  }
  
  const fileId = uploadResult.fileId;
  
  if (!fileId) {
    throw new Error('File service response missing file ID');
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
    fileId: fileId,               // File ID from new file service
    width: width || 1920,
    height: height || 1080,
  };
  
  return apiRequest('/api/backdrops', {
    method: 'POST',
    body: JSON.stringify(backdropData),
  });
}

/**
 * Fetch all backdrops for a specific user
 * @param userId The user ID to fetch backdrops for
 * @returns Array of backdrop objects
 */
export async function getBackdrops(userId: string): Promise<any[]> {
  return apiRequest(`/api/backdrops/${userId}`, {
    method: 'GET',
  });
}

/**
 * Remove background from images using file IDs
 * @param fileIds Array of file IDs to process
 * @returns Object containing processed subjects
 * 
 * TIMEOUT STRATEGY:
 * - Each image takes ~5 seconds
 * - Using 5-minute timeout to handle large batches (up to 60 images)
 * - TODO: Replace with async job queue for better UX (see architect recommendation)
 */
export async function removeBackgroundWithFileIds(fileIds: string[]): Promise<{
  subjects: Array<{
    originalFileId: string;
    processedFileId?: string;
    processedUrl?: string;
    error?: string;
  }>;
}> {
  // 5-minute timeout for background removal (sequential processing takes time)
  const timeout = 300000; // 300 seconds = 5 minutes
  
  return apiRequest('/api/remove-background', {
    method: 'POST',
    body: JSON.stringify({ fileIds }),
    timeout,
  });
}

/**
 * Create background removal job (async)
 * @param fileIds Array of file IDs to process
 * @returns Object with jobId
 */
export async function createBackgroundRemovalJob(fileIds: string[]): Promise<{ jobId: string }> {
  return apiRequest('/api/background-removal-jobs', {
    method: 'POST',
    body: JSON.stringify({ fileIds }),
    timeout: 10000, // Job creation is fast, only needs 10s
  });
}

/**
 * Get background removal job status
 * @param jobId Job ID to check
 * @returns Job status, progress, and results
 */
export async function getBackgroundRemovalJobStatus(jobId: string): Promise<{
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: { completed: number; total: number };
  results?: Array<{
    originalFileId: string;
    processedFileId?: string;
    processedUrl?: string;
    error?: string;
  }>;
  error_message?: string;
}> {
  return apiRequest(`/api/background-removal-jobs/${jobId}`, {
    method: 'GET',
    timeout: 5000, // Status check is fast
  });
}

/**
 * Create a new project batch
 * @param batchData The batch configuration
 * @returns The created batch object
 */
export async function createBatch(batchData: {
  userId: string;
  backdropFileId?: string | null;
  aspectRatio: string;
  positioning?: any;
  shadowConfig?: any;
  reflectionConfig?: any;
  totalImages?: number;
  status?: string;
}): Promise<any> {
  return apiRequest('/api/batches', {
    method: 'POST',
    body: JSON.stringify(batchData),
  });
}

/**
 * Update an existing batch
 * @param id The batch ID
 * @param updates Partial batch data to update
 * @returns The updated batch object
 */
export async function updateBatch(id: string, updates: any): Promise<any> {
  return apiRequest(`/api/batches/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}