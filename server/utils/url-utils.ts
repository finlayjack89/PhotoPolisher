/**
 * URL Utilities for External API Access
 * 
 * This module provides helpers for generating public URLs that external APIs
 * (Replicate, Cloudinary) can access to fetch files from our server.
 * 
 * Why this is needed:
 * - Files are stored in-memory with file IDs
 * - External APIs like Replicate accept HTTP URLs instead of base64
 * - Using URLs instead of base64 prevents server event loop blocking
 * - Significantly reduces memory usage and transfer time
 */

/**
 * Get the public domain for this Replit deployment
 * Uses REPLIT_DEV_DOMAIN for development, falls back to request host
 */
export function getPublicDomain(): string {
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  
  if (replitDomain) {
    return `https://${replitDomain}`;
  }
  
  // Fallback for local development
  return 'http://localhost:5000';
}

/**
 * Generate a public URL for a file ID that external APIs can access
 * @param fileId The internal file ID
 * @returns Full public URL to access the file
 */
export function getPublicFileUrl(fileId: string): string {
  const domain = getPublicDomain();
  return `${domain}/api/files/${fileId}`;
}

/**
 * Check if a URL is a local file API URL (starts with /api/files/)
 */
export function isLocalFileUrl(url: string): boolean {
  return url.startsWith('/api/files/') || url.includes('/api/files/');
}

/**
 * Convert a local file path to a public URL
 * Handles both relative (/api/files/:id) and full URLs
 */
export function toPublicUrl(urlOrPath: string): string {
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    // Already a full URL, check if it needs our domain
    if (urlOrPath.includes('/api/files/')) {
      const fileId = urlOrPath.split('/api/files/')[1];
      return getPublicFileUrl(fileId);
    }
    return urlOrPath;
  }
  
  if (urlOrPath.startsWith('/api/files/')) {
    const fileId = urlOrPath.replace('/api/files/', '');
    return getPublicFileUrl(fileId);
  }
  
  // Assume it's a file ID
  return getPublicFileUrl(urlOrPath);
}

/**
 * Extract file ID from a file URL
 */
export function extractFileIdFromUrl(url: string): string | null {
  const match = url.match(/\/api\/files\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
}
