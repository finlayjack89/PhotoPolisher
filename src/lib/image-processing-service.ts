import { api } from "@/lib/api-client";

// TypeScript Interfaces
export interface ProcessingOptions {
  operation: 'upscale' | 'compress';
  maxRetries?: number;
  retryDelayMs?: number;
  onProgress?: (progress: number) => void;
}

export interface ProcessingResult {
  success: boolean;
  processedImageUrl?: string;
  processedImageData?: string;
  originalSize?: number;
  processedSize?: number;
  compressionRatio?: string;
  error?: ProcessingError;
}

export interface ProcessingError {
  type: 'network_error' | 'file_too_large' | 'unsupported_format' | 'quota_exceeded' | 'api_error' | 'unknown_error';
  message: string;
  originalError?: any;
}

export interface ProcessingProgress {
  progress: number; // 0-100
  stage: 'preparing' | 'uploading' | 'processing' | 'downloading' | 'complete';
  message?: string;
}

export class ImageProcessingService {
  private static instance: ImageProcessingService;
  
  // Singleton pattern
  static getInstance(): ImageProcessingService {
    if (!ImageProcessingService.instance) {
      ImageProcessingService.instance = new ImageProcessingService();
    }
    return ImageProcessingService.instance;
  }

  /**
   * Process an image with upscaling or compression
   */
  async processImage(
    imageUrl: string,
    options: ProcessingOptions
  ): Promise<ProcessingResult> {
    const { operation, maxRetries = 3, retryDelayMs = 1000, onProgress } = options;
    
    // Validate input
    if (!imageUrl || !this.isValidImageUrl(imageUrl)) {
      return {
        success: false,
        error: {
          type: 'unsupported_format',
          message: 'Invalid or unsupported image URL format'
        }
      };
    }

    // Start processing with retry logic
    return this.retryWithBackoff(
      () => this.performProcessing(imageUrl, operation, onProgress),
      maxRetries,
      retryDelayMs
    );
  }

  /**
   * Retry logic with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    initialDelay: number
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain error types
        if (this.shouldNotRetry(error)) {
          throw error;
        }
        
        // Calculate delay with exponential backoff
        const delay = initialDelay * Math.pow(2, attempt);
        
        if (attempt < maxRetries - 1) {
          console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Perform the actual image processing
   */
  private async performProcessing(
    imageUrl: string,
    operation: 'upscale' | 'compress',
    onProgress?: (progress: number) => void
  ): Promise<ProcessingResult> {
    try {
      // Update progress: preparing
      this.updateProgress(onProgress, 10, 'preparing');
      
      // Convert image URL to base64 for processing
      const imageData = await this.urlToBase64(imageUrl);
      
      // Update progress: uploading
      this.updateProgress(onProgress, 30, 'uploading');
      
      // Prepare the request payload
      const fileName = this.extractFilenameFromUrl(imageUrl);
      const payload = {
        files: [{
          name: fileName,
          data: imageData,
          size: this.estimateFileSize(imageData),
          type: this.getImageMimeType(imageUrl)
        }]
      };

      // Update progress: processing
      this.updateProgress(onProgress, 50, 'processing');

      // Call the appropriate Express API endpoint
      // NOTE: Compression is skipped (Phase 1 stabilization - client-side compression handles this)
      const data = operation === 'upscale' 
        ? await api.upscaleImages(payload)
        : { 
            success: true, 
            compressedFiles: [{
              originalName: fileName,
              processedName: fileName,
              data: imageData,
              size: this.estimateFileSize(imageData),
              format: 'png',
              compressionRatio: 'Client-side compression already applied'
            }]
          };

      // Update progress: downloading
      this.updateProgress(onProgress, 80, 'downloading');

      // Process the response
      const result = this.processResponse(data, operation);
      
      // Update progress: complete
      this.updateProgress(onProgress, 100, 'complete');
      
      return result;

    } catch (error) {
      console.error(`Error during ${operation}:`, error);
      return {
        success: false,
        error: this.mapErrorToProcessingError(error)
      };
    }
  }

  /**
   * Convert image URL to base64
   */
  private async urlToBase64(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      
      // Check file size
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > 20 * 1024 * 1024) { // 20MB limit
        throw this.createProcessingError('file_too_large', 'File size exceeds 20MB limit');
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      return base64;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Failed to fetch')) {
        throw this.createProcessingError('network_error', 'Failed to download image from URL', error);
      }
      throw error;
    }
  }

  /**
   * Process the Edge Function response
   */
  private processResponse(data: any, operation: string): ProcessingResult {
    if (!data || !data.success) {
      throw this.createProcessingError('api_error', data?.error || 'Processing failed');
    }

    const processedFiles = operation === 'upscale' ? data.upscaledFiles : data.compressedFiles;
    
    if (!processedFiles || processedFiles.length === 0) {
      throw this.createProcessingError('api_error', 'No processed files returned');
    }

    const processedFile = processedFiles[0];
    
    // Convert base64 back to data URL for display
    const mimeType = this.getImageMimeType(processedFile.processedName || processedFile.originalName);
    const processedImageUrl = `data:${mimeType};base64,${processedFile.data}`;

    return {
      success: true,
      processedImageUrl,
      processedImageData: processedFile.data,
      originalSize: processedFile.originalSize,
      processedSize: processedFile.size,
      compressionRatio: processedFile.compressionRatio
    };
  }

  /**
   * Update progress callback
   */
  private updateProgress(
    onProgress: ((progress: number) => void) | undefined,
    progress: number,
    stage: string
  ): void {
    if (onProgress) {
      onProgress(progress);
    }
  }

  /**
   * Map generic errors to ProcessingError
   */
  private mapErrorToProcessingError(error: any): ProcessingError {
    if (error.type) {
      return error; // Already a ProcessingError
    }

    const message = error.message || String(error);
    
    if (message.includes('fetch')) {
      return { type: 'network_error', message, originalError: error };
    }
    
    if (message.includes('quota') || message.includes('rate limit')) {
      return { type: 'quota_exceeded', message, originalError: error };
    }
    
    if (message.includes('size') || message.includes('large')) {
      return { type: 'file_too_large', message, originalError: error };
    }
    
    if (message.includes('format') || message.includes('unsupported')) {
      return { type: 'unsupported_format', message, originalError: error };
    }
    
    return { type: 'unknown_error', message, originalError: error };
  }

  /**
   * Create a ProcessingError
   */
  private createProcessingError(
    type: ProcessingError['type'],
    message: string,
    originalError?: any
  ): ProcessingError {
    return { type, message, originalError };
  }

  /**
   * Check if error should not be retried
   */
  private shouldNotRetry(error: any): boolean {
    if (error.type) {
      return ['file_too_large', 'unsupported_format', 'quota_exceeded'].includes(error.type);
    }
    
    const message = error.message || String(error);
    return message.includes('quota') || 
           message.includes('unsupported') || 
           message.includes('too large');
  }

  /**
   * Utility methods
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isValidImageUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      return /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(pathname) || url.startsWith('data:image/');
    } catch {
      return url.startsWith('data:image/');
    }
  }

  private extractFilenameFromUrl(url: string): string {
    if (url.startsWith('data:')) {
      return 'image.png';
    }
    
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop() || 'image.png';
      return filename.includes('.') ? filename : `${filename}.png`;
    } catch {
      return 'image.png';
    }
  }

  private getImageMimeType(filename: string): string {
    const extension = filename.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'gif': 'image/gif',
      'bmp': 'image/bmp'
    };
    return mimeTypes[extension || 'png'] || 'image/png';
  }

  private estimateFileSize(base64Data: string): number {
    // Rough estimate: base64 adds ~33% overhead
    return Math.floor(base64Data.length * 0.75);
  }
}

// Export singleton instance for easy use
export const imageProcessingService = ImageProcessingService.getInstance();