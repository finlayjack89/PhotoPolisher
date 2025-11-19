/**
 * Consolidated fetch utility functions (Phase 1 optimization)
 * Shared by multiple server-side image processing modules
 */
import fetch from 'node-fetch';

/**
 * Fetch with timeout to prevent hanging requests
 * 
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns Promise resolving to Response
 */
export async function fetchWithTimeout(
  url: string, 
  options: any, 
  timeout: number = 30000
): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Retry wrapper with exponential backoff for transient failures
 * 
 * @param operation - Async operation to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelay - Base delay in milliseconds (default: 2000)
 * @returns Promise resolving to operation result
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff: 2s, 4s, 8s
        console.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`Operation failed after ${maxRetries} attempts:`, lastError);
  throw lastError;
}
