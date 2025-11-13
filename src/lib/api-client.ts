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