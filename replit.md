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
- **Dynamic Batch Sizing**: Intelligent batching system calculates optimal batch sizes (3-10 images) based on actual image sizes, maximizing throughput while staying under 200MB per-batch frontend target and 300MB backend validation limit. Frontend uses `calculateOptimalBatchSize()` utility with conservative handling of unknown-size images (one per batch). Backend validates total batch sizes for both file IDs and base64 payloads. Shadow generation processes 2 parallel batches, canvas compositing handles 3 images simultaneously for optimal performance without memory pressure.
- **Performance Metrics Logging**: Comprehensive timing instrumentation across all major operations with standardized logging prefixes (⏱️ [PERF], ⏱️ [API]) for easy filtering. Tracks image compression (duration, iterations, final size), shadow generation (per-image upload/transform/cleanup phases plus batch totals), background removal (prediction and download times), and all API calls. Enables identification of bottlenecks and slow operations through detailed timing data with file names, operation names, and computed averages.
- **Smart Timeout Tuning**: Dynamic timeout calculation via `calculateTimeout()` utility adjusts API timeout values based on operation type and image size. Base timeouts: upload (15s), shadow transform (30s), background removal (90s), download (20s). Large images (>10MB) receive +2s per MB over 10MB, max +120s extra, with 240s polling limit accommodating maximum 210s bg-removal timeout plus 30s safety margin. Includes size-based warnings for images >50MB. Prevents premature timeouts for large enterprise images (80-100MB) while failing fast for smaller operations.
- **Cloudinary Request Queuing**: Queue-based processing via `processQueue()` utility limits concurrent Cloudinary API requests to 3, preventing rate limiting on free/starter plans while maintaining good throughput. FIFO ordering with per-item error handling allows individual failures without breaking entire batch. Progress logging shows completed/total/active request counts. Automatically adjusts worker count for small batches (e.g., 2 items = 2 workers).
- **Granular Progress Tracking**: Per-image status tracking with monotonic state progression (pending → uploading → compressing → shadowing → compositing → complete) displayed in real-time UI. Map-based state management with color-coded status icons (Clock, Upload, Minimize2, Moon, Wand2, CheckCircle, AlertCircle) and smart sorting (errors/active at top, completed at bottom). Handles both fresh shadow jobs (full pipeline) and cached shadows (abbreviated flow with cache indicators). ScrollArea component manages large batches efficiently with inline error messages and timing delays ensuring visibility of each step.

### Studio-Grade Reflection System (November 2025)
- **Smart Reflection Generator**: New `generateSmartReflection()` function uses ctx.filter for performance-optimized blur (4px default), Fresnel falloff gradient (0%, 40%, 100% stops), and destination-in compositing for photorealistic product reflections with default opacity 0.25 for professional subtle appearance. Three-step pipeline: vertical flip with blur, Fresnel gradient mask, and master opacity application.
- **Seamless Layer Compositing**: 2px overlap between product and reflection eliminates anti-aliasing gaps. Proper z-ordering ensures reflection renders beneath subject in `compositeLayersV2` with async/await guarantees.
- **Fixed Double-Opacity Bug**: Corrected opacity application to prevent invisible reflections (6% visibility issue). Opacity is now baked into reflection texture during generation via destination-in compositing, then drawn to main canvas with `ctx.globalAlpha = 1.0` to avoid double-fading.
- **Smart Gap Fix for Transparent Padding**: `getBottomPadding()` utility detects and eliminates gaps caused by transparent padding in source images via bottom-up alpha channel scan, ensuring pixel-to-pixel contact between product and reflection.
- **Contact Shadow (Ambient Occlusion) System**: Adds realistic grounding effect via `generateContactShadow()` function creating downscaled black silhouettes squashed to 15% of product height with blur(8px) + 40% opacity. Proper z-ordering: Backdrop → Cloudinary Shadow → Reflection → Contact Shadow → Product.
- **Robust Error Handling**: Comprehensive logging with 🪞 [SmartReflection] prefixes. Try-catch blocks allow graceful degradation without failing entire operation.

### Product Positioning Bug Fixes (November 2025)
- **Fixed Invalid Initial Placement**: Changed default placement from y: 1.2 to y: 0.85 to stay within valid 0-1 range.
- **Fixed Asymmetric Shadow Padding**: Updated `computeCompositeLayout` to account for Cloudinary's asymmetric drop shadow padding (80% bottom / 20% top split).
- **CSS Preview & Canvas Consistency**: Both CSS preview and canvas compositor now use identical positioning logic.

### Code Cleanup & UX Improvements (November 2025)
- **Legacy Code Removal**: Deleted deprecated `compositeLayers` function (~170 lines) from canvas-utils.ts. Only `compositeLayersV2` is now the active compositor.
- **Duplicate Utility Consolidation**: Removed duplicate `loadImage` from image-resize-utils.ts; all components now import from centralized file-utils.ts. Removed local `fileToDataUrl` implementations from BackdropPositioning.tsx and BatchProcessingStep.tsx.
- **Bundle Size Optimization**: Deleted 11 unused shadcn UI components (calendar, input-otp, menubar, pagination, navigation-menu, breadcrumb, chart, carousel, avatar, hover-card, context-menu).
- **Persistent Navigation**: Created Navbar component with Home, Library, Settings links integrated into App.tsx layout wrapper with conditional hiding for workflow routes.
- **Mobile Touch Support**: Added touch event handlers (onTouchStart, onTouchMove, onTouchEnd, onTouchCancel) to BackdropPositioning.tsx preview container for drag-to-position functionality on mobile devices.
- **ETA Progress Tracking**: Added estimated time remaining display to BatchProcessingStep with dynamic calculation based on elapsed time and progress percentage.
- **API Cleanup**: Removed commented-out deprecated endpoints from api-client.ts and routes.ts (old synchronous background removal, TinyPNG compression).

### Liquid Glass iOS 26 Design System (November 2025)
- **New Color Palette**: Updated primary colors to indigo 600 (#4f46e5) and violet 600 (#7c3aed) for modern iOS 26-inspired aesthetic. Updated HSL variables in index.css for both light and dark themes.
- **Glass Morphism Effects**: Implemented glass-surface utilities with backdrop-filter: blur(24px), semi-transparent backgrounds (rgba/hsla with 0.6-0.8 opacity), and subtle borders for frosted glass appearance.
- **Reusable CSS Utilities**: Created `.section-glass`, `.btn-gradient`, `.bg-gradient-electric`, `.glass-surface`, and `.text-gradient` utility classes for consistent glass-style components.
- **Gradient Hero Sections**: Hero section on homepage features soft gradient background (indigo-50/10 to violet-50/10) with prominent gradient text for "Studio-Quality Images" headline.
- **Pill-Shaped Buttons**: Navigation and primary action buttons use rounded-full or rounded-xl styling with gradient backgrounds for modern pill appearance.
- **Frosted Glass Navigation**: Navbar uses backdrop-filter blur with semi-transparent background, matching iOS 26 navigation bar aesthetic.
- **Settings & Library Redesign**: Modernized Settings and Library pages with glass card styling, icon-prefixed headers, and consistent section-glass containers.
- **Simplified Positioning Logic**: Removed `getBottomPadding()` function and `BOTTOM_PADDING_RATIO` from canvas-utils.ts for simplified, user-controlled product positioning without automatic padding manipulation.

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