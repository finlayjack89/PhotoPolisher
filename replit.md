# LuxSnap - Professional Photo Editing Platform

## Overview
LuxSnap is a professional photo editing platform for e-commerce and product photography. It leverages AI for features like background removal, shadow generation, backdrop positioning, and batch processing to produce studio-quality product images, aiming to streamline workflows and enhance visual content for businesses.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Frameworks**: React 18 (TypeScript, Vite, React Router, TanStack Query).
- **UI/UX**: Radix UI, Tailwind CSS (custom HSL theme), shadcn/ui.
- **State Management**: React Context (authentication), TanStack Query (async data), local component state.
- **Image Processing**: Client-side pipeline for upload/compression, HEIC to PNG conversion, AI background removal, EXIF/manual rotation, Cloudinary shadow generation, canvas-based compositing, and CSS reflections.

### Backend Architecture
- **Server**: Express.js (TypeScript), Vite HMR middleware, CORS, 50MB payload limit.
- **Storage**: `MemStorage` class with `IStorage` interface for future database integration.
- **API Design**: RESTful endpoints for quotas, caching, backdrops, batches, and image processing.
- **Database**: PostgreSQL with Drizzle ORM (tables for user quotas, processing cache, system health, backdrop library, batch images, background removal jobs).
- **Job Queue**: Asynchronous processing for background removal with parallel worker (concurrency=3), database-backed job tracking, and polling-based frontend integration.

### Key Architectural Decisions
- **Client-Side Image Processing**: Minimizes server load and API costs using browser's Canvas API.
- **Hybrid Storage**: `IStorage` interface for flexible, future-proof storage.
- **Multi-Step Workflow**: Simplifies complex editing with clear user feedback.
- **API-First**: Ensures modularity and extensibility.
- **Type Safety**: Achieved with TypeScript, Zod, and Drizzle.
- **Opaque File IDs**: UUIDs abstract storage details, enabling cloud migration.
- **Comprehensive API Hardening**: Timeout control, exponential backoff, and defensive parsing for external APIs.
- **Async Job Queue for Background Removal**: Prevents event loop blocking using immediate 202 responses, parallel workers, file URLs, and frontend polling.
- **Production Deployment Strategy**: Dual-mode server detects production environment (`REPLIT_DEPLOYMENT=1` or `NODE_ENV=production`), serving pre-built static files for stable deployment on Replit Autoscale.
- **Canvas Compositing**: Redesigned to match CSS preview behavior with width-first scaling and proper layer ordering (Backdrop → Shadow → Reflection → Clean Product).
- **Intelligent Auto-Deskew System**: Automated straightening of tilted product images using morphological operations, connected component analysis, RANSAC line fitting, and confidence scoring.

### Phase 1 Optimizations (November 2025)
- **File ID Architecture for Shadows**: Eliminated large base64 payloads in shadow batch API responses (100x reduction from ~50MB to ~500KB) by storing shadowed images as files and returning opaque file IDs. All code paths (success + errors) correctly return `shadowedFileId` for frontend consumption via `/api/files/:id`.
- **Harmonized File Size Limits**: Unified upload limits to 40MB across Multer middleware, Express payload parser, and frontend validation to support 4K+ high-resolution product images without inconsistencies.
- **Optimized Compression Settings**: Increased target from 5MB to 8MB and max dimension from 2048px to 3072px for better quality while maintaining performance and bandwidth efficiency.
- **Code Consolidation**: Created `server/utils/fetch-utils.ts` (fetchWithTimeout, retryWithBackoff) and `src/lib/file-utils.ts` (fileToDataUrl, formatFileSize, loadImage) to eliminate duplicate implementations across codebase. Removed deprecated `compress-images.ts`.

### Phase 2 Performance Optimizations (November 2025)
- **Memory-Aware Batch Size Validation**: Enforces 300MB total batch size limit across all processing endpoints to prevent out-of-memory errors. Includes frontend pre-compression validation with helpful toast messages, Zod-validated API route guards for both fileIds and base64 images payloads, and normalized base64 size calculations. Applied to shadow generation, background removal, and all batch processing endpoints with consistent 400 error responses including computed sizes.
- **Canvas Memory Management**: Comprehensive cleanup of HTML canvas elements after all image processing operations to prevent memory leaks during batch workflows. Created `cleanupCanvas()` helper function and integrated cleanup into 8 functions across 4 files (canvas-utils, reflection-utils, image-orientation-utils, image-resize-utils). Uses try-finally blocks to guarantee cleanup on all code paths including the critical hot compression path in `processAndCompressImage`, preventing memory buildup when processing large batches of high-resolution images.

## External Dependencies

### AI & Image Processing Services
- **Replicate API**: AI background removal (BRIA RMBG model).
- **Cloudinary**: Image transformations and drop shadow generation.
- **Google Gemini 2.5 Flash**: AI image analysis and quality assessment.

### Database & Infrastructure
- **Neon Database**: Serverless PostgreSQL.
- **Drizzle ORM**: Type-safe database toolkit.

### File Handling
- **heic2any**: HEIC to PNG conversion.
- **JSZip**: Batch ZIP archive creation.
- **react-dropzone**: Drag-and-drop file upload.

### UI & Utilities
- **date-fns**: Date manipulation.
- **class-variance-authority**: Type-safe component variants.
- **embla-carousel**: Touch-friendly carousel.