// API client for making requests to the Express backend

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

  return response.json();
}

export async function apiUpload<T = any>(endpoint: string, formData: FormData): Promise<T> {
  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || `Upload failed: ${response.status}`);
  }

  return response.json();
}

// New file upload functions
export async function removeBackground(file: File) {
  const formData = new FormData();
  formData.append('image', file);
  return apiUpload<any>('/api/remove-backgrounds', formData);
}

export async function uploadBackdrop(formData: FormData) {
  return apiUpload<any>('/api/backdrops', formData);
}

export async function analyzeBackdrop(formData: FormData) {
  return apiUpload<any>('/api/analyze-backdrop', formData);
}

export async function getBackdrops(userId: string) {
  return apiRequest<any[]>(`/api/backdrops/${userId}`);
}

export const api = {
  // Image processing endpoints
  removeBackgrounds: (data: any) => apiRequest('/api/remove-backgrounds', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  removeBackground, // New single-file upload function
  uploadBackdrop,
  analyzeBackdrop,
  getBackdrops,
  
  compressImages: (data: any) => apiRequest('/api/compress-images', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  analyzeImages: (data: any) => apiRequest('/api/analyze-images', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  addDropShadow: (data: any) => apiRequest('/api/add-drop-shadow', {
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
