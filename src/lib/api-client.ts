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
   * Polls for job status with robust retry logic for connection issues.
   * Uses exponential backoff on transient failures (connection drops, timeouts).
   * Extended retry count to handle Vite HMR restarts and network turbulence.
   */
  getJobStatus: async (
    jobId: string,
    retryCount: number = 0,
  ): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    final_image_url?: string;
    error_message?: string;
  }> => {
    const MAX_RETRIES = 5; // Increased from 3 to handle longer outages
    const BASE_DELAY = 500; // Start with shorter delay
    const MAX_DELAY = 5000; // Cap at 5 seconds
    
    try {
      return await apiRequest(`/api/job-status/${jobId}`, {
        method: 'GET',
        timeout: 15000, // 15 second timeout for status checks (increased for stability)
      });
    } catch (error: any) {
      // Check if this is a transient error (connection drop, timeout, network error)
      const isTransient = 
        error.name === 'AbortError' ||
        error.message?.includes('timeout') ||
        error.message?.includes('network') ||
        error.message?.includes('fetch') ||
        error.message?.includes('connection') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('ERR_');
      
      if (isTransient && retryCount < MAX_RETRIES) {
        // Exponential backoff with jitter and cap: 500ms, 1s, 2s, 4s, 5s
        const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount) + Math.random() * 200, MAX_DELAY);
        console.log(`[JobStatus] Retry ${retryCount + 1}/${MAX_RETRIES} for job ${jobId} after ${Math.round(delay)}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return api.getJobStatus(jobId, retryCount + 1);
      }
      
      throw error;
    }
  },

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

/**
 * Shared cache for lazy-loaded data URLs.
 * Prevents duplicate fetch→dataURL conversions when the same image is needed multiple times.
 * Keyed by URL or processedFileId.
 * 
 * Uses LRU eviction to prevent unbounded memory growth.
 */
const MAX_CACHE_SIZE = 50; // Maximum number of cached data URLs
const dataUrlCache = new Map<string, string>();
const cacheAccessOrder: string[] = []; // Track access order for LRU eviction

/**
 * LRU cache eviction: Remove oldest entries when cache exceeds max size
 */
function evictLRUEntries(): void {
  while (dataUrlCache.size > MAX_CACHE_SIZE && cacheAccessOrder.length > 0) {
    const oldestKey = cacheAccessOrder.shift();
    if (oldestKey && dataUrlCache.has(oldestKey)) {
      dataUrlCache.delete(oldestKey);
      console.log(`🗑️ LRU eviction: removed ${oldestKey.substring(0, 50)}...`);
    }
  }
}

/**
 * Update LRU access order when a key is accessed
 */
function updateAccessOrder(key: string): void {
  const existingIndex = cacheAccessOrder.indexOf(key);
  if (existingIndex > -1) {
    cacheAccessOrder.splice(existingIndex, 1);
  }
  cacheAccessOrder.push(key);
}

/**
 * Add entry to cache with LRU management
 */
function addToCache(key: string, value: string): void {
  if (!key) return;
  
  updateAccessOrder(key);
  dataUrlCache.set(key, value);
  evictLRUEntries();
}

/**
 * Get entry from cache and update access order
 */
function getFromCache(key: string): string | undefined {
  if (!key) return undefined;
  
  const value = dataUrlCache.get(key);
  if (value) {
    updateAccessOrder(key);
  }
  return value;
}

/**
 * Clear the data URL cache (useful for memory cleanup after batch processing)
 */
export function clearDataUrlCache(): void {
  dataUrlCache.clear();
  cacheAccessOrder.length = 0;
  console.log('🧹 Data URL cache cleared');
}

/**
 * Get cache statistics for debugging
 */
export function getDataUrlCacheStats(): { size: number; maxSize: number; keys: string[] } {
  return {
    size: dataUrlCache.size,
    maxSize: MAX_CACHE_SIZE,
    keys: Array.from(dataUrlCache.keys())
  };
}

/**
 * Lazy-load a data URL from an HTTP URL
 * Used for converting server-stored images to data URLs for canvas operations
 * Includes LRU caching to prevent duplicate fetches and bound memory usage
 * @param url The HTTP URL to fetch
 * @returns A data URL (base64-encoded image)
 */
export async function urlToDataUrl(url: string): Promise<string> {
  if (!url) {
    throw new Error('No URL provided');
  }
  
  // If it's already a data URL, return as-is
  if (url.startsWith('data:')) {
    return url;
  }
  
  // Check cache first (uses LRU access order update)
  const cached = getFromCache(url);
  if (cached) {
    console.log(`📦 Cache hit for URL: ${url.substring(0, 50)}...`);
    return cached;
  }
  
  try {
    console.log(`🔄 Fetching image for data URL conversion: ${url.substring(0, 50)}...`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
      reader.readAsDataURL(blob);
    });
    
    // Store in LRU cache (handles eviction automatically)
    addToCache(url, dataUrl);
    console.log(`✅ Cached data URL for: ${url.substring(0, 50)}... (cache size: ${dataUrlCache.size}/${MAX_CACHE_SIZE})`);
    
    return dataUrl;
  } catch (error) {
    console.error('Failed to convert URL to data URL:', error);
    throw error;
  }
}

/**
 * Helper to get a displayable image source - prioritizes URLs over data URLs
 * For <img src=...> display, prefer URLs for efficiency
 * @param image Object with backgroundRemovedUrl and/or backgroundRemovedData
 * @returns The best available image source for display
 */
export function getDisplayImageSrc(image: { backgroundRemovedUrl?: string; backgroundRemovedData?: string }): string {
  return image.backgroundRemovedUrl || image.backgroundRemovedData || '';
}

/**
 * Helper to get a data URL for canvas operations, lazy-loading if necessary
 * Uses LRU caching to prevent duplicate fetch→dataURL conversions
 * ALWAYS stores results in cache - uses processedFileId as primary key, URL as fallback key
 * @param image Object with backgroundRemovedUrl and/or backgroundRemovedData, and optional processedFileId for cache key
 * @returns A data URL suitable for canvas operations
 */
export async function getCanvasImageData(image: { 
  backgroundRemovedUrl?: string; 
  backgroundRemovedData?: string;
  processedFileId?: string;
}): Promise<string> {
  // Determine cache key: prefer processedFileId, fallback to URL
  const cacheKey = image.processedFileId || image.backgroundRemovedUrl || '';
  
  // Check cache first if we have a valid key
  if (cacheKey) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log(`📦 Cache hit for ${image.processedFileId ? 'processedFileId' : 'URL'}: ${cacheKey.substring(0, 50)}...`);
      return cached;
    }
  }
  
  // If we already have a data URL, cache it and return
  if (image.backgroundRemovedData && image.backgroundRemovedData.startsWith('data:')) {
    // Always cache - use processedFileId if available, otherwise URL
    if (cacheKey) {
      addToCache(cacheKey, image.backgroundRemovedData);
      console.log(`✅ Cached existing data URL by ${image.processedFileId ? 'fileId' : 'URL'}: ${cacheKey.substring(0, 50)}...`);
    }
    return image.backgroundRemovedData;
  }
  
  // Lazy-load from URL
  if (image.backgroundRemovedUrl) {
    const dataUrl = await urlToDataUrl(image.backgroundRemovedUrl);
    
    // ALWAYS cache result - by processedFileId AND by URL for redundant lookup paths
    if (image.processedFileId) {
      addToCache(image.processedFileId, dataUrl);
    }
    // urlToDataUrl already caches by URL, but ensure we have it
    if (!getFromCache(image.backgroundRemovedUrl)) {
      addToCache(image.backgroundRemovedUrl, dataUrl);
    }
    
    return dataUrl;
  }
  
  throw new Error('No image data available');
}

/**
 * Prefetch multiple images in parallel for canvas operations
 * Useful for batch processing to load all images before starting compositing
 * @param images Array of image objects with URL/data properties
 * @returns Promise that resolves when all images are cached
 */
export async function prefetchCanvasImageData(images: Array<{ 
  backgroundRemovedUrl?: string; 
  backgroundRemovedData?: string;
  processedFileId?: string;
  name?: string;
}>): Promise<Map<string, string>> {
  console.log(`🔄 Prefetching ${images.length} images for canvas operations...`);
  const startTime = Date.now();
  
  const results = await Promise.allSettled(
    images.map(async (img) => {
      const data = await getCanvasImageData(img);
      return { key: img.processedFileId || img.backgroundRemovedUrl || img.name || '', data };
    })
  );
  
  const dataMap = new Map<string, string>();
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      dataMap.set(result.value.key, result.value.data);
    } else {
      console.warn(`⚠️ Failed to prefetch image ${index}:`, result.reason);
    }
  });
  
  const duration = Date.now() - startTime;
  console.log(`✅ Prefetch complete: ${dataMap.size}/${images.length} images cached in ${duration}ms`);
  
  return dataMap;
}